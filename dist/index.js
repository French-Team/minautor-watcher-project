import dotenv from "dotenv";
import { pathToFileURL } from "url";
import { createDetectionModule } from "./detection/index.js";
import { EventUtils } from "./detection/events.js";
import { createPreventionModule, } from "./prevention/index.js";
import { createTriggerModule } from "./trigger/index.js";
import logger from "./shared/logger.js";
import { createHealthHttpServer } from "./server/http.js";
export { CURRENT_YEAR, WATCHER_VERSION, getSystemInfo, detectTools, detectDevEnvironment, generateEnvReport, printBanner, printCompactBanner, } from "./environment/index.js";
// Load environment variables
dotenv.config({ path: ".env.local" });
/**
 * Main Watcher Service class that orchestrates all modules
 */
export class WatcherService {
    detectionModule;
    preventionModule;
    triggerModule;
    httpServer = null;
    config;
    isRunning = false;
    draining = false;
    activeTasks = 0;
    drainResolvers = [];
    metrics = {
        filesProcessed: 0,
        filesCorrected: 0,
        filesFailed: 0,
        totalProcessingTime: 0,
        startTime: null,
        lastFileTime: null,
    };
    constructor(config = {}) {
        this.config = {
            watchDir: process.env.WATCH_DIR || process.cwd(),
            enablePrevention: true,
            enableTrigger: true,
            port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
            ...config,
        };
    }
    getMetrics() {
        return { ...this.metrics };
    }
    resetMetrics() {
        this.metrics = {
            filesProcessed: 0,
            filesCorrected: 0,
            filesFailed: 0,
            totalProcessingTime: 0,
            startTime: null,
            lastFileTime: null,
        };
    }
    getPreventionModule() {
        return this.preventionModule;
    }
    getTriggerModule() {
        return this.triggerModule;
    }
    /**
     * Initialize all modules
     */
    async initialize() {
        logger.info("Initializing Watcher Service...");
        try {
            // Initialize detection module
            this.detectionModule = createDetectionModule({
                watchDir: this.config.watchDir,
            });
            // Initialize prevention module (if enabled)
            if (this.config.enablePrevention !== false) {
                this.preventionModule = await createPreventionModule();
            }
            else {
                logger.info("Prevention module disabled via configuration");
            }
            // Initialize trigger module (if enabled)
            if (this.config.enableTrigger !== false) {
                this.triggerModule = createTriggerModule();
            }
            else {
                logger.info("Trigger module disabled via configuration");
            }
            // Set up module communication
            this.setupModuleCommunication();
            // Start HTTP health server if port configured
            if (this.config.port) {
                this.httpServer = createHealthHttpServer(this.config.port, {
                    getStatus: () => this.getStatus(),
                    getMetrics: () => this.getMetrics(),
                });
                if (this.httpServer) {
                    await this.httpServer.start();
                }
            }
            logger.success("Watcher Service initialized successfully");
        }
        catch (error) {
            logger.error("Failed to initialize Watcher Service:", error);
            throw error;
        }
    }
    /**
     * Start the watcher service
     */
    async start() {
        if (!this.detectionModule ||
            !this.preventionModule ||
            !this.triggerModule) {
            throw new Error("Watcher Service not initialized. Call initialize() first.");
        }
        logger.info("Starting Watcher Service...");
        try {
            // Start all modules
            await Promise.all([
                this.detectionModule.start(),
                this.preventionModule.start(),
                this.triggerModule.start(),
            ]);
            logger.success("Watcher Service started successfully");
            this.isRunning = true;
        }
        catch (error) {
            logger.error("Failed to start Watcher Service:", error);
            throw error;
        }
    }
    /**
     * Stop the watcher service (graceful drain with configurable timeout)
     */
    async stop() {
        logger.info("Stopping Watcher Service...");
        try {
            // Stop HTTP server first
            if (this.httpServer) {
                await this.httpServer.stop();
                this.httpServer = null;
            }
            // Enter drain mode: ignore new events, wait for in-flight
            this.draining = true;
            const drainTimeout = this.config.drainTimeout || 10000;
            if (this.activeTasks > 0) {
                logger.info(`Draining ${this.activeTasks} active task(s) (timeout: ${drainTimeout}ms)...`);
                await Promise.race([
                    this.waitForDrain(),
                    new Promise((resolve) => setTimeout(resolve, drainTimeout)),
                ]);
                if (this.activeTasks > 0) {
                    logger.warn(`Drain timed out with ${this.activeTasks} task(s) still active`);
                }
            }
            // Stop all modules
            await Promise.all([
                this.detectionModule?.stop(),
                this.preventionModule?.stop(),
                this.triggerModule?.stop(),
            ].filter(Boolean));
            logger.success("Watcher Service stopped successfully");
            this.isRunning = false;
            this.draining = false;
        }
        catch (error) {
            logger.error("Error stopping Watcher Service:", error);
            throw error;
        }
    }
    waitForDrain() {
        if (this.activeTasks === 0)
            return Promise.resolve();
        return new Promise((resolve) => {
            this.drainResolvers.push(resolve);
        });
    }
    beginTask() {
        this.activeTasks++;
    }
    endTask() {
        this.activeTasks--;
        if (this.activeTasks <= 0 && this.draining) {
            this.activeTasks = 0;
            for (const resolve of this.drainResolvers)
                resolve();
            this.drainResolvers = [];
        }
    }
    /**
     * Whether the service is in drain mode
     */
    isDraining() {
        return this.draining;
    }
    /**
     * Set up communication between modules
     */
    setupModuleCommunication() {
        if (!this.detectionModule) {
            return;
        }
        // Set up event forwarding from detection to prevention and trigger
        this.detectionModule.eventBus.on("fileDetected", EventUtils.wrapAsyncHandler(async (event) => {
            if (this.draining) {
                logger.debug(`Ignoring file event during drain: ${event.file.filePath}`);
                return;
            }
            this.beginTask();
            const startTime = Date.now();
            try {
                this.metrics.filesProcessed++;
                this.metrics.lastFileTime = new Date();
                // Process file through prevention module (if available)
                let preventionResult = {
                    filePath: event.file.filePath,
                    success: true,
                    errors: [],
                    warnings: [],
                    executionTime: 0,
                };
                if (this.preventionModule) {
                    preventionResult = await this.preventionModule.processFile(event.file.filePath);
                }
                // Trigger corrections (if available)
                if (this.triggerModule) {
                    if (preventionResult.success ||
                        preventionResult.warnings.length > 0) {
                        await this.triggerModule.processEvent({
                            filePath: event.file.filePath,
                            eventType: "fileDetected",
                            metadata: { preventionResult },
                            timestamp: new Date(),
                        });
                    }
                    // If prevention fails, send notification
                    if (!preventionResult.success) {
                        this.metrics.filesFailed++;
                        await this.triggerModule.processEvent({
                            filePath: event.file.filePath,
                            eventType: "preventionFailed",
                            error: {
                                message: `Prevention failed: ${preventionResult.errors.length} errors`,
                                preventionResult,
                            },
                            timestamp: new Date(),
                        });
                    }
                    else {
                        this.metrics.filesCorrected++;
                    }
                }
                this.metrics.totalProcessingTime += Date.now() - startTime;
            }
            catch (error) {
                this.metrics.filesFailed++;
                logger.error("Error in detection event handling:", error);
            }
            finally {
                this.endTask();
            }
        }));
        this.detectionModule.eventBus.on("fileModified", EventUtils.wrapAsyncHandler(async (event) => {
            if (this.draining) {
                return;
            }
            this.beginTask();
            const startTime = Date.now();
            try {
                this.metrics.filesProcessed++;
                this.metrics.lastFileTime = new Date();
                // Process file through prevention module (if available)
                let preventionResult = {
                    filePath: event.file.filePath,
                    success: true,
                    errors: [],
                    warnings: [],
                    executionTime: 0,
                };
                if (this.preventionModule) {
                    preventionResult = await this.preventionModule.processFile(event.file.filePath);
                }
                // Trigger corrections (if available)
                if (this.triggerModule) {
                    await this.triggerModule.processEvent({
                        filePath: event.file.filePath,
                        eventType: "fileModified",
                        metadata: { preventionResult },
                        timestamp: new Date(),
                    });
                }
                if (preventionResult.success) {
                    this.metrics.filesCorrected++;
                }
                else {
                    this.metrics.filesFailed++;
                }
                this.metrics.totalProcessingTime += Date.now() - startTime;
            }
            catch (error) {
                this.metrics.filesFailed++;
                logger.error("Error in file modification handling:", error);
            }
            finally {
                this.endTask();
            }
        }));
        this.detectionModule.eventBus.on("fileDeleted", EventUtils.wrapAsyncHandler(async (event) => {
            if (this.draining) {
                return;
            }
            this.beginTask();
            try {
                if (this.triggerModule) {
                    await this.triggerModule.processEvent({
                        filePath: event.file.filePath,
                        eventType: "fileDeleted",
                        timestamp: new Date(),
                    });
                }
            }
            catch (error) {
                logger.error("Error in file deletion handling:", error);
            }
            finally {
                this.endTask();
            }
        }));
        logger.success("Module communication setup completed");
    }
    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: Boolean(this.detectionModule && this.preventionModule && this.triggerModule),
            running: this.isRunning,
            metrics: this.getMetrics(),
            modules: {
                detection: this.detectionModule?.getStatus(),
                prevention: this.preventionModule?.getStatus(),
                trigger: this.triggerModule?.getStatus(),
            },
        };
    }
    /**
     * Reload configuration for all modules
     */
    async reloadConfig() {
        logger.info("Reloading configuration...");
        try {
            await Promise.all([
                this.detectionModule?.reloadConfig(),
                this.preventionModule?.reloadConfig(),
                this.triggerModule?.reloadConfig(),
            ].filter(Boolean));
            logger.success("Configuration reloaded successfully");
        }
        catch (error) {
            logger.error("Error reloading configuration:", error);
            throw error;
        }
    }
}
/**
 * Main entry point
 */
async function main() {
    const { WatcherCLI } = await import("./cli/index.js");
    const cli = new WatcherCLI();
    await cli.run();
}
/**
 * Export for programmatic usage
 */
export default WatcherService;
// Run CLI if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        logger.error("Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map