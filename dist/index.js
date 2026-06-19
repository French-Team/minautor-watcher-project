import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import { createDetectionModule } from "./detection/index.js";
import { EventUtils } from "./detection/events.js";
import { createPreventionModule, } from "./prevention/index.js";
import { createTriggerModule } from "./trigger/index.js";
import { buildFixReport, writeFixReport, cleanFixReports, ActiveWarningsManager } from "./fallback/index.js";
import logger, { clearLogFiles, writeLogHeader, writeReport } from "./shared/logger.js";
import { Utils } from "./shared/utils.js";
import { createHealthHttpServer } from "./server/http.js";
import { execSync } from "child_process";
import { createResourceMonitor } from "./monitor/index.js";
import { ChainOrchestrator } from "./processor/index.js";
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
    resourceMonitor = null;
    chainOrchestrator = null;
    activeWarnings;
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
    activeWarningsInitialized = false;
    scanSummary = { successCount: 0, failedCount: 0, warningCount: 0, errorRules: new Map() };
    scanFileCount = 0;
    validationResult = null;
    reportDebounceTimer = null;
    REPORT_IDLE_MS = 20_000;
    constructor(config = {}) {
        this.config = {
            watchDir: process.env.WATCH_DIR || process.cwd(),
            enablePrevention: true,
            enableTrigger: true,
            port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
            ...config,
        };
        this.activeWarnings = new ActiveWarningsManager();
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
    /**
     * Build and write the final report file.
     * Called on idle detection and on shutdown.
     */
    async writeReportFile() {
        const httpPort = this.httpServer && typeof this.httpServer.getPort === "function"
            ? this.httpServer.getPort()
            : undefined;
        const errorRulesObj = {};
        for (const [rule, count] of this.scanSummary.errorRules) {
            errorRulesObj[rule] = count;
        }
        const fixReportDir = this.config.watchDir ? path.join(this.config.watchDir, ".fix-reports") : "";
        let actualFixReportCount = 0;
        if (fixReportDir) {
            try {
                const files = await fs.readdir(fixReportDir);
                actualFixReportCount = files.filter((f) => f.startsWith("fix-") && f.endsWith(".md")).length;
            }
            catch {
                // directory doesn't exist
            }
        }
        await writeReport({
            startTime: this.metrics.startTime?.toISOString() || new Date().toISOString(),
            endTime: new Date().toISOString(),
            targetDir: this.config.watchDir,
            fileCount: this.scanFileCount,
            filesProcessed: this.metrics.filesProcessed,
            filesCorrected: this.metrics.filesCorrected,
            filesFailed: this.metrics.filesFailed,
            warningCount: this.scanSummary.warningCount,
            fixReportCount: actualFixReportCount,
            warningFileCount: this.activeWarnings.fileCount(),
            errorRules: errorRulesObj,
            httpPort,
            validation: this.validationResult || undefined,
            activeWarningsCount: this.activeWarnings.totalCount(),
        });
    }
    /**
     * Debounced report update: resets a 20s timer on each file event.
     * The report is only written once the pipeline has been idle for 20s.
     */
    scheduleReportUpdate() {
        if (this.reportDebounceTimer) {
            clearTimeout(this.reportDebounceTimer);
        }
        this.reportDebounceTimer = setTimeout(() => {
            this.reportDebounceTimer = null;
            this.writeReportFile().catch(() => { });
        }, this.REPORT_IDLE_MS);
    }
    /**
     * Validate the target project directory for required tooling
     */
    async validateTargetProject(dir) {
        const dirExists = await Utils.pathExists(dir);
        const hasPackageJson = await Utils.pathExists(path.join(dir, "package.json"));
        const hasNodeModules = await Utils.pathExists(path.join(dir, "node_modules"));
        let eslintVersion = null;
        try {
            eslintVersion = execSync("npx eslint --version", { cwd: dir, encoding: "utf-8", timeout: 5000 }).trim();
        }
        catch { /* not available */ }
        let prettierVersion = null;
        try {
            prettierVersion = execSync("npx prettier --version", { cwd: dir, encoding: "utf-8", timeout: 5000 }).trim();
        }
        catch { /* not available */ }
        return { dirExists, hasPackageJson, hasNodeModules, eslintVersion, prettierVersion };
    }
    getPreventionModule() {
        return this.preventionModule;
    }
    getTriggerModule() {
        return this.triggerModule;
    }
    getResourceMonitor() {
        return this.resourceMonitor;
    }
    /**
     * Initialize all modules
     */
    async initialize() {
        // Clear winston log files and write a fresh header for this run.
        // This prevents accumulation across runs and makes each run's output
        // easy to identify (no more confusing "same errors" from previous runs).
        await clearLogFiles();
        await writeLogHeader({ targetDir: this.config.watchDir });
        logger.info("Initializing Watcher Service...");
        try {
            // Initialize detection module
            this.detectionModule = createDetectionModule({
                watchDir: this.config.watchDir,
                processExisting: this.config.processExisting,
                processExistingDelay: this.config.processExistingDelay,
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
            // Initialize chain orchestrator (N sequential chains) — MUST be before setupModuleCommunication
            const chainCount = parseInt(process.env.CHAIN_COUNT || "5");
            this.chainOrchestrator = new ChainOrchestrator(this.preventionModule, this.triggerModule ?? null, chainCount, (result) => {
                this.metrics.filesProcessed++;
                this.metrics.lastFileTime = new Date();
                this.metrics.totalProcessingTime += result.executionTime;
                // Schedule a report update after 20s of inactivity
                this.scheduleReportUpdate();
                if (result.success) {
                    this.metrics.filesCorrected++;
                    this.scanSummary.successCount++;
                    if (result.preventionResult?.warnings?.length) {
                        this.scanSummary.warningCount += result.preventionResult.warnings.length;
                        // Persist warnings to active-warnings so agents see them (blue logs via addWarnings)
                        const warningEntries = result.preventionResult.warnings.map((w) => ({
                            filePath: result.filePath,
                            rule: w.rule,
                            message: w.message,
                            severity: w.severity || "warning",
                        }));
                        this.activeWarnings.addWarnings(result.filePath, warningEntries);
                        for (const w of result.preventionResult.warnings) {
                            const count = this.scanSummary.errorRules.get(w.rule) || 0;
                            this.scanSummary.errorRules.set(w.rule, count + 1);
                        }
                        // Also write a fix report so agents in the target project can see the warnings
                        if (this.config.watchDir) {
                            const report = buildFixReport(result.filePath, result.preventionResult.warnings, this.config.watchDir);
                            writeFixReport(report).catch((err) => logger.error("Failed to write fix report (warnings):", err));
                        }
                    }
                    else {
                        // Clean SUCCESS — no warnings, no errors
                        this.activeWarnings.resolveWarnings(result.filePath);
                    }
                }
                else if (this.config.watchDir) {
                    this.metrics.filesFailed++;
                    this.scanSummary.failedCount++;
                    const projectDir = this.config.watchDir;
                    const errors = result.preventionResult.errors.map((e) => ({
                        rule: e.rule,
                        message: e.message,
                        severity: e.severity,
                    }));
                    if (errors.length > 0) {
                        for (const e of errors) {
                            const count = this.scanSummary.errorRules.get(e.rule) || 0;
                            this.scanSummary.errorRules.set(e.rule, count + 1);
                        }
                        this.activeWarnings.addWarnings(result.filePath, errors.map((e) => ({
                            filePath: result.filePath,
                            rule: e.rule,
                            message: e.message,
                            severity: e.severity,
                        })));
                        const report = buildFixReport(result.filePath, errors, projectDir);
                        writeFixReport(report).catch((err) => logger.error("Failed to write fix report:", err));
                    }
                }
            });
            // Set up module communication (requires chainOrchestrator to be initialized)
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
            // Start resource monitor
            this.resourceMonitor = createResourceMonitor();
            // Load active warnings from disk
            await this.activeWarnings.init();
            // Clean stale fix reports from target project
            if (this.config.watchDir) {
                await cleanFixReports(this.config.watchDir);
            }
            // Validate target project
            if (this.config.watchDir) {
                const report = await this.validateTargetProject(this.config.watchDir);
                this.validationResult = {
                    eslint: report.eslintVersion,
                    prettier: report.prettierVersion,
                    hasPackageJson: report.hasPackageJson,
                    hasNodeModules: report.hasNodeModules,
                };
                const check = (ok) => ok ? "✓" : "✗";
                logger.info(`Target project validation:\n` +
                    `  ${check(report.dirExists)} Directory exists\n` +
                    `  ${check(report.hasPackageJson)} package.json\n` +
                    `  ${check(report.hasNodeModules)} node_modules\n` +
                    `  ${check(report.eslintVersion !== null)} ESLint: ${report.eslintVersion ?? "not found"}\n` +
                    `  ${check(report.prettierVersion !== null)} Prettier: ${report.prettierVersion ?? "not found"}`);
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
        this.metrics.startTime = new Date();
        try {
            // Start all modules
            await Promise.all([
                this.detectionModule.start(),
                this.preventionModule.start(),
                this.triggerModule.start(),
            ]);
            // Wait for initial scan to complete, then write log header with actual file count
            const scanResult = await this.detectionModule.waitForScanComplete();
            this.scanFileCount = scanResult.fileCount;
            await writeLogHeader({
                targetDir: this.config.watchDir,
                fileCount: scanResult.fileCount,
            });
            // Schedule first report — will fire after 20s idle once all queued files are processed
            this.scheduleReportUpdate();
            logger.success("Watcher Service started successfully");
            this.isRunning = true;
            // Start resource monitoring
            this.resourceMonitor?.start();
            // Register signal handlers for graceful shutdown
            const shutdown = async (signal) => {
                logger.info(`Received ${signal}, shutting down gracefully...`);
                await this.stop();
                process.exit(0);
            };
            process.on("SIGINT", () => shutdown("SIGINT"));
            process.on("SIGTERM", () => shutdown("SIGTERM"));
            // USR1 = reload config, USR2 = graceful restart (Unix only)
            if (typeof process.on === "function") {
                process.on("SIGUSR1", () => {
                    logger.info("Received SIGUSR1, reloading configuration...");
                    this.reloadConfig().catch((err) => {
                        logger.error("Failed to reload config:", err);
                    });
                });
                process.on("SIGUSR2", async () => {
                    logger.info("Received SIGUSR2, performing graceful restart...");
                    await this.stop();
                    await this.initialize();
                    await this.start();
                });
            }
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
        // Cancel pending debounced report and write immediately
        if (this.reportDebounceTimer) {
            clearTimeout(this.reportDebounceTimer);
            this.reportDebounceTimer = null;
        }
        await this.writeReportFile().catch(() => { });
        try {
            // Stop resource monitor first
            this.resourceMonitor?.stop();
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
     * All file events are routed to the chain orchestrator for sequential processing.
     */
    setupModuleCommunication() {
        if (!this.detectionModule || !this.chainOrchestrator) {
            return;
        }
        const enqueue = async (event) => {
            if (this.draining) {
                logger.debug(`Ignoring file event during drain: ${event.file.filePath}`);
                return;
            }
            this.beginTask();
            try {
                this.chainOrchestrator.enqueue(event.file.filePath);
            }
            catch (error) {
                this.metrics.filesFailed++;
                logger.error("Error enqueueing file:", error);
            }
            finally {
                // endTask called after chain completes (via onComplete callback)
                // For enqueue we end immediately — chain processes asynchronously
                this.endTask();
            }
        };
        this.detectionModule.eventBus.on("fileDetected", EventUtils.wrapAsyncHandler(enqueue));
        this.detectionModule.eventBus.on("fileModified", EventUtils.wrapAsyncHandler(enqueue));
        this.detectionModule.eventBus.on("fileDeleted", EventUtils.wrapAsyncHandler(async (event) => {
            if (this.draining)
                return;
            this.beginTask();
            try {
                this.triggerModule?.processEvent({
                    filePath: event.file.filePath,
                    eventType: "fileDeleted",
                    timestamp: new Date(),
                });
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
        const snapshot = this.resourceMonitor?.getSnapshot();
        return {
            initialized: Boolean(this.detectionModule && this.preventionModule && this.triggerModule),
            running: this.isRunning,
            metrics: this.getMetrics(),
            modules: {
                detection: this.detectionModule?.getStatus(),
                prevention: this.preventionModule?.getStatus(),
                trigger: this.triggerModule?.getStatus(),
            },
            processor: this.chainOrchestrator
                ? {
                    chains: this.chainOrchestrator.getChainStatus(),
                    queued: this.chainOrchestrator.getTotalQueued(),
                    busy: this.chainOrchestrator.getBusyChains(),
                }
                : undefined,
            resources: snapshot
                ? {
                    cpu: `${snapshot.cpu.usagePercent}%`,
                    memory: `${snapshot.memory.usedMB}/${snapshot.memory.totalMB} MB (${snapshot.memory.usagePercent}%)`,
                    heap: `${snapshot.heap.usedMB} MB`,
                    loadAvg: snapshot.loadAvg[0].toFixed(2),
                }
                : undefined,
        };
    }
    /**
     * Reload configuration for all modules
     */
    async reloadConfig() {
        logger.info("Reloading configuration...");
        try {
            Utils.clearStatCache();
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