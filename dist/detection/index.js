import { WatcherEvent, createWatcher } from "./watcher.js";
import { FilterPresets, createFileFilter, } from "./filters.js";
import { DetectionEvent, eventBus as defaultEventBus, cleanupAllListeners, } from "./events.js";
import { Utils, ConfigSchemas } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("detection");
/**
 * Main detection module that orchestrates file watching, filtering, and event emission
 */
export class DetectionModule {
    watcher;
    filter;
    eventBus;
    config;
    isRunning = false;
    constructor(config, dependencies) {
        this.config = config;
        this.eventBus = dependencies?.eventBus || defaultEventBus;
        // Create watcher instance
        this.watcher = createWatcher({
            watchDir: config.watchDir,
            excludedDirs: config.excludedDirs,
            watchExtensions: config.watchExtensions,
            processingDelay: config.processingDelay,
            processExisting: config.processExisting,
            processExistingDelay: config.processExistingDelay,
        });
        // Create filter instance (note: extensions also filtered by Watcher.shouldProcessFile -
        // double-check is intentional for defense-in-depth when FileFilter is used standalone)
        const filterCriteria = config.filterPreset
            ? FilterPresets[config.filterPreset]()
            : config.customFilters || {};
        this.filter = createFileFilter(filterCriteria);
    }
    /**
     * Start the detection module
     */
    async start() {
        if (this.isRunning) {
            logger.warn("Detection module is already running");
            return;
        }
        try {
            logger.info("Starting detection module...");
            // Start the file watcher
            await this.watcher.start();
            // Set up watcher event forwarding
            this.setupWatcherEventForwarding();
            this.isRunning = true;
            logger.success("Detection module started successfully");
        }
        catch (error) {
            logger.error("Failed to start detection module:", error);
            throw error;
        }
    }
    /**
     * Stop the detection module
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn("Detection module is not running");
            return;
        }
        try {
            logger.info("Stopping detection module...");
            // Stop the file watcher
            await this.watcher.stop();
            // V5.9: Cleanup all tracked listeners to prevent memory leaks
            cleanupAllListeners();
            this.isRunning = false;
            logger.success("Detection module stopped successfully");
        }
        catch (error) {
            logger.error("Failed to stop detection module:", error);
            throw error;
        }
    }
    /**
     * Wait for the initial scan to complete
     */
    async waitForScanComplete() {
        return this.watcher.waitForScanComplete();
    }
    /**
     * Update filter criteria
     */
    updateFilter(criteria) {
        this.filter.updateCriteria(criteria);
        logger.info("Filter criteria updated");
    }
    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            watcherStatus: this.watcher.getStatus(),
            filterCriteria: this.filter.getCriteria(),
        };
    }
    /**
     * Reload configuration
     */
    async reloadConfig() {
        logger.info("Reloading detection configuration...");
        // Re-read configuration from environment variables
        const newConfig = {
            watchDir: process.env.WATCH_DIR || this.config.watchDir,
            excludedDirs: (process.env.EXCLUDED_DIRS || this.config.excludedDirs.join(",")).split(","),
            watchExtensions: (process.env.WATCH_EXTENSIONS || this.config.watchExtensions.join(",")).split(","),
            processingDelay: parseInt(process.env.PROCESSING_DELAY || String(this.config.processingDelay)),
            filterPreset: this.config.filterPreset,
            customFilters: this.config.customFilters,
        };
        this.config = newConfig;
        // Recreate the filter with updated criteria
        const filterCriteria = newConfig.filterPreset
            ? FilterPresets[newConfig.filterPreset]()
            : newConfig.customFilters || {};
        this.filter = createFileFilter(filterCriteria);
        // If running, restart the watcher with new config
        if (this.isRunning) {
            // V5.9: Cleanup listeners before re-adding
            cleanupAllListeners();
            await this.watcher.stop();
            this.watcher = createWatcher({
                watchDir: newConfig.watchDir,
                excludedDirs: newConfig.excludedDirs,
                watchExtensions: newConfig.watchExtensions,
                processingDelay: newConfig.processingDelay,
            });
            await this.watcher.start();
            this.setupWatcherEventForwarding();
        }
        logger.success("Detection configuration reloaded");
    }
    /**
     * Set up forwarding of watcher events to detection events
     */
    setupWatcherEventForwarding() {
        // Forward file events through the detection filter
        const forwardEvent = (detectionEvent) => {
            return async (event) => {
                const filterResult = await this.filter.apply(event);
                if (filterResult.passed) {
                    logger.debug(`File passed filter: ${event.filePath}`);
                    this.eventBus.emit(detectionEvent, { file: event, filterResult });
                }
                else {
                    logger.debug(`File filtered out: ${event.filePath} - ${filterResult.reason}`);
                }
            };
        };
        // Set up event forwarding
        this.watcher.on(WatcherEvent.FILE_ADDED, forwardEvent(DetectionEvent.FILE_DETECTED));
        this.watcher.on(WatcherEvent.FILE_CHANGED, forwardEvent(DetectionEvent.FILE_MODIFIED));
        this.watcher.on(WatcherEvent.FILE_DELETED, forwardEvent(DetectionEvent.FILE_DELETED));
        this.watcher.on(WatcherEvent.WATCHER_READY, () => {
            logger.info("File watcher is ready");
        });
        this.watcher.on(WatcherEvent.WATCHER_ERROR, (error) => {
            logger.error("Watcher error:", error);
            this.eventBus.emitDetectionError(error, "watcher");
        });
    }
}
/**
 * Factory function to create a detection module
 */
export function createDetectionModule(config, dependencies) {
    const defaultConfig = {
        watchDir: process.env.WATCH_DIR || process.cwd(),
        excludedDirs: (process.env.EXCLUDED_DIRS || "node_modules,.git,dist,build").split(","),
        watchExtensions: (process.env.WATCH_EXTENSIONS || "js,ts,jsx,tsx,json,md").split(","),
        processingDelay: parseInt(process.env.PROCESSING_DELAY || "100"),
        filterPreset: "jsTsProject",
    };
    const finalConfig = { ...defaultConfig, ...config };
    // Validate configuration
    Utils.validateConfig(finalConfig, ConfigSchemas.watcherConfig);
    return new DetectionModule(finalConfig, dependencies);
}
/**
 * Quick setup function for common use cases
 */
export async function setupDetection(config) {
    const module = createDetectionModule(config);
    // Note: Signal handlers (SIGINT/SIGTERM) are managed centrally
    // by WatcherService in src/index.ts
    return module;
}
export default DetectionModule;
//# sourceMappingURL=index.js.map