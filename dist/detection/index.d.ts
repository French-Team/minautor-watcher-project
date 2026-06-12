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
    customFilters?: any;
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
    constructor(config: DetectionConfig);
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
    updateFilter(criteria: any): void;
    /**
     * Get current status
     */
    getStatus(): {
        isRunning: boolean;
        watcherStatus: any;
        filterCriteria: any;
    };
    /**
     * Reload configuration
     */
    reloadConfig(): Promise<void>;
    /**
     * Set up internal event handlers
     */
    private setupEventHandlers;
    /**
     * Set up forwarding of watcher events to detection events
     */
    private setupWatcherEventForwarding;
    /**
     * Handle file events with processing tracking
     */
    private handleFileEvent;
}
/**
 * Factory function to create a detection module
 */
export declare function createDetectionModule(config?: Partial<DetectionConfig>): DetectionModule;
/**
 * Quick setup function for common use cases
 */
export declare function setupDetection(config?: Partial<DetectionConfig>): Promise<DetectionModule>;
export default DetectionModule;
//# sourceMappingURL=index.d.ts.map