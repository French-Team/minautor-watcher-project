import EventEmitter from 'events';
/**
 * Custom events emitted by the watcher
 */
export declare enum WatcherEvent {
    FILE_ADDED = "fileAdded",
    FILE_CHANGED = "fileChanged",
    FILE_DELETED = "fileDeleted",
    WATCHER_READY = "watcherReady",
    WATCHER_ERROR = "watcherError"
}
/**
 * Configuration for the file watcher
 */
export interface WatcherConfig {
    watchDir: string;
    excludedDirs: string[];
    watchExtensions: string[];
    processingDelay: number;
    persistent: boolean;
    ignoreInitial: boolean;
}
/**
 * File watcher class that monitors file system changes
 */
export declare class Watcher extends EventEmitter {
    private watcher;
    private config;
    private processingQueue;
    constructor(config: WatcherConfig);
    /**
     * Start watching the specified directory
     */
    start(): Promise<void>;
    /**
     * Stop watching and clean up resources
     */
    stop(): Promise<void>;
    /**
     * Create ignore patterns for Chokidar
     */
    private createIgnorePatterns;
    /**
     * Set up Chokidar event listeners
     */
    private setupEventListeners;
    /**
     * Handle file events with debouncing
     */
    private handleFileEvent;
    /**
     * Check if file should be processed based on extension
     */
    private shouldProcessFile;
    /**
     * Process the actual file event
     */
    private processFileEvent;
    /**
     * Get current watcher status
     */
    getStatus(): {
        isRunning: boolean;
        watchedFiles: number;
    };
}
/**
 * Factory function to create a watcher instance
 */
export declare function createWatcher(config?: Partial<WatcherConfig>): Watcher;
export default Watcher;
//# sourceMappingURL=watcher.d.ts.map