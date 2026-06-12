import { Command } from "commander";
import dotenv from "dotenv";
import { pathToFileURL } from "url";
import { createDetectionModule } from "./detection/index.js";
import { createPreventionModule, } from "./prevention/index.js";
import { createTriggerModule } from "./trigger/index.js";
import logger from "./shared/logger.js";
// Load environment variables
dotenv.config({ path: ".env.local" });
/**
 * Main Watcher Service class that orchestrates all modules
 */
export class WatcherService {
    detectionModule;
    preventionModule;
    triggerModule;
    config;
    constructor(config = {}) {
        this.config = {
            watchDir: process.env.WATCH_DIR || process.cwd(),
            ...config,
        };
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
            // Initialize prevention module
            this.preventionModule = createPreventionModule();
            // Initialize trigger module
            this.triggerModule = createTriggerModule();
            // Set up module communication
            this.setupModuleCommunication();
            logger.info("Watcher Service initialized successfully");
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
            logger.info("Watcher Service started successfully");
        }
        catch (error) {
            logger.error("Failed to start Watcher Service:", error);
            throw error;
        }
    }
    /**
     * Stop the watcher service
     */
    async stop() {
        logger.info("Stopping Watcher Service...");
        try {
            // Stop all modules
            await Promise.all([
                this.detectionModule?.stop(),
                this.preventionModule?.stop(),
                this.triggerModule?.stop(),
            ].filter(Boolean));
            logger.info("Watcher Service stopped successfully");
        }
        catch (error) {
            logger.error("Error stopping Watcher Service:", error);
            throw error;
        }
    }
    /**
     * Set up communication between modules
     */
    setupModuleCommunication() {
        if (!this.detectionModule ||
            !this.preventionModule ||
            !this.triggerModule) {
            return;
        }
        // Set up event forwarding from detection to prevention and trigger
        this.detectionModule.eventBus.on("fileDetected", async (event) => {
            try {
                // Process file through prevention module
                const preventionResult = await this.preventionModule.processFile(event.file.filePath);
                // If prevention passes or has warnings, trigger corrections
                if (preventionResult.success || preventionResult.warnings.length > 0) {
                    await this.triggerModule.processEvent({
                        filePath: event.file.filePath,
                        eventType: "fileDetected",
                        metadata: {
                            preventionResult,
                        },
                        timestamp: new Date(),
                    });
                }
                // If prevention fails, send notification
                if (!preventionResult.success) {
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
            }
            catch (error) {
                logger.error("Error in detection event handling:", error);
            }
        });
        this.detectionModule.eventBus.on("fileModified", async (event) => {
            try {
                // Process file through prevention module
                const preventionResult = await this.preventionModule.processFile(event.file.filePath);
                // Trigger corrections
                await this.triggerModule.processEvent({
                    filePath: event.file.filePath,
                    eventType: "fileModified",
                    metadata: {
                        preventionResult,
                    },
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger.error("Error in file modification handling:", error);
            }
        });
        logger.info("Module communication setup completed");
    }
    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: Boolean(this.detectionModule && this.preventionModule && this.triggerModule),
            running: false, // Will be updated when start() is called
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
            logger.info("Configuration reloaded successfully");
        }
        catch (error) {
            logger.error("Error reloading configuration:", error);
            throw error;
        }
    }
}
/**
 * CLI interface for the Watcher Service
 */
export class WatcherCLI {
    service;
    program;
    constructor() {
        this.service = new WatcherService();
        this.program = new Command();
        this.setupCLI();
    }
    setupCLI() {
        this.program
            .name("watcher")
            .description("File watcher service for surveillance, prevention, and automatic correction")
            .version("1.0.0");
        this.program
            .command("start")
            .description("Start the watcher service")
            .option("-d, --dir <directory>", "Directory to watch", process.env.WATCH_DIR || process.cwd())
            .option("--no-prevention", "Disable prevention module")
            .option("--no-trigger", "Disable trigger module")
            .action(async (options) => {
            try {
                logger.info("Starting Watcher Service via CLI...");
                // Update service configuration
                this.service = new WatcherService({
                    watchDir: options.dir,
                });
                await this.service.initialize();
                await this.service.start();
                logger.info("Watcher Service started. Press Ctrl+C to stop.");
                // Keep the process running
                process.on("SIGINT", async () => {
                    logger.info("Received SIGINT, stopping service...");
                    await this.service.stop();
                    process.exit(0);
                });
                process.on("SIGTERM", async () => {
                    logger.info("Received SIGTERM, stopping service...");
                    await this.service.stop();
                    process.exit(0);
                });
            }
            catch (error) {
                logger.error("Error starting service:", error);
                process.exit(1);
            }
        });
        this.program
            .command("stop")
            .description("Stop the watcher service")
            .action(async () => {
            try {
                await this.service.stop();
                logger.info("Watcher Service stopped");
            }
            catch (error) {
                logger.error("Error stopping service:", error);
                process.exit(1);
            }
        });
        this.program
            .command("status")
            .description("Show watcher service status")
            .action(() => {
            const status = this.service.getStatus();
            console.log(JSON.stringify(status, null, 2));
        });
        this.program
            .command("reload")
            .description("Reload configuration")
            .action(async () => {
            try {
                await this.service.reloadConfig();
                logger.info("Configuration reloaded");
            }
            catch (error) {
                logger.error("Error reloading configuration:", error);
                process.exit(1);
            }
        });
        this.program
            .command("test")
            .description("Test the watcher service with a sample file")
            .option("-f, --file <file>", "File to test with")
            .action(async (options) => {
            try {
                if (!options.file) {
                    console.error("Please specify a file to test with: --file <file>");
                    process.exit(1);
                }
                await this.service.initialize();
                logger.info(`Testing with file: ${options.file}`);
                // Simulate file events
                const testResult = await this.service["preventionModule"]?.processFile(options.file);
                console.log("Test result:", JSON.stringify(testResult, null, 2));
            }
            catch (error) {
                logger.error("Error in test:", error);
                process.exit(1);
            }
        });
    }
    /**
     * Parse and execute CLI commands
     */
    async run() {
        try {
            await this.program.parseAsync(process.argv);
        }
        catch (error) {
            logger.error("CLI error:", error);
            process.exit(1);
        }
    }
}
/**
 * Main entry point
 */
async function main() {
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