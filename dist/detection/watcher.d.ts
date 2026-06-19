import EventEmitter from "events";
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
    maxQueueSize?: number;
    /** If true, emit FILE_ADDED for each existing file during initial scan */
    processExisting?: boolean;
    /** Delay (ms) between emitting each existing file event (prevents CPU flood) */
    processExistingDelay?: number;
}
/**
 * File watcher class that monitors file system changes.
 *
 * Uses native fs.watch({ recursive: true }) which creates
 * a single ReadDirectoryChangesW handle instead of one per subdirectory.
 */
export declare class Watcher extends EventEmitter {
    private nativeWatcher;
    private config;
    private processingQueue;
    private pendingEvents;
    private maxQueueSize;
    private watchedCount;
    private ignoredDirs;
    private ignoredExtensions;
    private watchIgnorePatterns;
    private recentlyEmitted;
    private recentlyEmittedTTL;
    private scanCompletePromise;
    private resolveScanComplete;
    private running;
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
     * Recursively count files matching watched extensions.
     * If processExisting is enabled, emit FILE_ADDED for each file (with delay to prevent CPU flood).
     * Otherwise, just count — only real-time changes from fs.watch trigger the pipeline.
     */
    private scanInitialFiles;
    /**
     * Handle an event from native fs.watch.
     * Filename is relative to the watched directory.
     */
    private handleNativeEvent;
    /**
     * Check if a relative path should be ignored.
     * Checks: ALWAYS_IGNORED, excludedDirs, .watchignore patterns, ignored extensions.
     */
    private isIgnored;
    /**
     * Handle file events with debouncing.
     * FILE_ADDED has priority over FILE_CHANGED for the same file.
     */
    private handleFileEvent;
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
    /**
     * Wait for the initial scan to complete
     */
    waitForScanComplete(): Promise<{
        fileCount: number;
    }>;
}
/**
 * Factory function to create a watcher instance
 */
export declare function createWatcher(config?: Partial<WatcherConfig>): Watcher;
export default Watcher;
//# sourceMappingURL=watcher.d.ts.map