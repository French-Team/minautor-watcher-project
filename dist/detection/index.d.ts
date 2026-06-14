import { FilterCriteria } from "./filters.js";
import { DetectionEventBus } from "./events.js";
/**
 * Configuration for the detection module
 */
export interface DetectionConfig {
    watchDir: string;
    excludedDirs: string[];
    watchExtensions: string[];
    processingDelay: number;
    filterPreset?: "jsTsProject" | "minimal" | "comprehensive";
    customFilters?: FilterCriteria;
}
/**
 * Main detection module that orchestrates file watching, filtering, and event emission
 */
export declare class DetectionModule {
    private watcher;
    private filter;
    eventBus: DetectionEventBus;
    private config;
    private isRunning;
    constructor(config: DetectionConfig, dependencies?: {
        eventBus?: DetectionEventBus;
    });
    /**
     * Start the detection module
     */
    start(): Promise<void>;
    /**
     * Stop the detection module
     */
    stop(): Promise<void>;
    /**
     * Update filter criteria
     */
    updateFilter(criteria: Partial<FilterCriteria>): void;
    /**
     * Get current status
     */
    getStatus(): {
        isRunning: boolean;
        watcherStatus: {
            isRunning: boolean;
            watchedFiles: number;
        };
        filterCriteria: FilterCriteria;
    };
    /**
     * Reload configuration
     */
    reloadConfig(): Promise<void>;
    /**
     * Set up forwarding of watcher events to detection events
     */
    private setupWatcherEventForwarding;
}
/**
 * Factory function to create a detection module
 */
export declare function createDetectionModule(config?: Partial<DetectionConfig>, dependencies?: {
    eventBus?: DetectionEventBus;
}): DetectionModule;
/**
 * Quick setup function for common use cases
 */
export declare function setupDetection(config?: Partial<DetectionConfig>): Promise<DetectionModule>;
export default DetectionModule;
//# sourceMappingURL=index.d.ts.map