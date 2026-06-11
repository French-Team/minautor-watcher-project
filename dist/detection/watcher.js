import chokidar from 'chokidar';
import path from 'path';
import EventEmitter from 'events';
import { Utils, ConfigSchemas } from '../shared/utils.js';
import { createChildLogger } from '../shared/logger.js';
const logger = createChildLogger('detection');
/**
 * Custom events emitted by the watcher
 */
export var WatcherEvent;
(function (WatcherEvent) {
    WatcherEvent["FILE_ADDED"] = "fileAdded";
    WatcherEvent["FILE_CHANGED"] = "fileChanged";
    WatcherEvent["FILE_DELETED"] = "fileDeleted";
    WatcherEvent["WATCHER_READY"] = "watcherReady";
    WatcherEvent["WATCHER_ERROR"] = "watcherError";
})(WatcherEvent || (WatcherEvent = {}));
/**
 * File watcher class that monitors file system changes
 */
export class Watcher extends EventEmitter {
    watcher = null;
    config;
    processingQueue = new Map();
    constructor(config) {
        super();
        this.config = config;
    }
    /**
     * Start watching the specified directory
     */
    async start() {
        try {
            logger.info(`Starting watcher for directory: ${this.config.watchDir}`);
            // Validate watch directory exists
            if (!(await Utils.pathExists(this.config.watchDir))) {
                throw new Error(`Watch directory does not exist: ${this.config.watchDir}`);
            }
            // Create ignore patterns
            const ignorePatterns = this.createIgnorePatterns();
            // Initialize Chokidar watcher
            this.watcher = chokidar.watch(this.config.watchDir, {
                ignored: ignorePatterns,
                persistent: this.config.persistent,
                ignoreInitial: this.config.ignoreInitial,
                awaitWriteFinish: {
                    stabilityThreshold: 200,
                    pollInterval: 100,
                },
                usePolling: false,
                interval: 100,
                binaryInterval: 300,
                cwd: this.config.watchDir,
            });
            // Set up event listeners
            this.setupEventListeners();
            logger.info('Watcher started successfully');
        }
        catch (error) {
            logger.error('Failed to start watcher:', error);
            this.emit(WatcherEvent.WATCHER_ERROR, error);
            throw error;
        }
    }
    /**
     * Stop watching and clean up resources
     */
    async stop() {
        try {
            if (this.watcher) {
                logger.info('Stopping watcher...');
                // Clear any pending processing timers
                this.processingQueue.forEach(timeout => clearTimeout(timeout));
                this.processingQueue.clear();
                await this.watcher.close();
                this.watcher = null;
                logger.info('Watcher stopped successfully');
            }
        }
        catch (error) {
            logger.error('Error stopping watcher:', error);
            throw error;
        }
    }
    /**
     * Create ignore patterns for Chokidar
     */
    createIgnorePatterns() {
        const patterns = [];
        // Add default exclusions
        const defaultExclusions = [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/*.log',
            '**/.DS_Store',
        ];
        // Add configured exclusions
        this.config.excludedDirs.forEach(dir => {
            patterns.push(new RegExp(`**/${dir}/**`));
        });
        // Combine all patterns
        const allPatterns = [...defaultExclusions, ...patterns.map(p => p.source)];
        logger.debug('Ignore patterns:', allPatterns);
        return allPatterns.map(pattern => new RegExp(pattern));
    }
    /**
     * Set up Chokidar event listeners
     */
    setupEventListeners() {
        if (!this.watcher)
            return;
        this.watcher
            .on('add', (filePath) => this.handleFileEvent(WatcherEvent.FILE_ADDED, filePath))
            .on('change', (filePath) => this.handleFileEvent(WatcherEvent.FILE_CHANGED, filePath))
            .on('unlink', (filePath) => this.handleFileEvent(WatcherEvent.FILE_DELETED, filePath))
            .on('ready', () => {
            logger.info('Initial scan complete');
            this.emit(WatcherEvent.WATCHER_READY);
        })
            .on('error', (error) => {
            logger.error('Watcher error:', error);
            this.emit(WatcherEvent.WATCHER_ERROR, error);
        });
    }
    /**
     * Handle file events with debouncing
     */
    handleFileEvent(event, filePath) {
        // Check if file should be processed based on extensions
        if (!this.shouldProcessFile(filePath)) {
            return;
        }
        logger.debug(`File event: ${event} - ${filePath}`);
        // Clear existing timer for this file
        const existingTimer = this.processingQueue.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Set new timer for debounced processing
        const timer = setTimeout(() => {
            this.processingQueue.delete(filePath);
            this.processFileEvent(event, filePath);
        }, this.config.processingDelay);
        this.processingQueue.set(filePath, timer);
    }
    /**
     * Check if file should be processed based on extension
     */
    shouldProcessFile(filePath) {
        const extension = Utils.getFileExtension(filePath);
        return this.config.watchExtensions.includes(extension);
    }
    /**
     * Process the actual file event
     */
    processFileEvent(event, filePath) {
        const absolutePath = path.resolve(this.config.watchDir, filePath);
        logger.info(`${event} - ${absolutePath}`);
        // Emit the event with file details
        this.emit(event, {
            filePath: absolutePath,
            relativePath: filePath,
            extension: Utils.getFileExtension(absolutePath),
            timestamp: new Date(),
        });
    }
    /**
     * Get current watcher status
     */
    getStatus() {
        if (!this.watcher) {
            return {
                isRunning: false,
                watchedFiles: 0,
            };
        }
        const watchedPaths = this.watcher.getWatched();
        let totalFiles = 0;
        // Count total number of watched files across all directories
        for (const files of Object.values(watchedPaths)) {
            if (Array.isArray(files)) {
                totalFiles += files.length;
            }
        }
        return {
            isRunning: true,
            watchedFiles: totalFiles,
        };
    }
}
/**
 * Factory function to create a watcher instance
 */
export function createWatcher(config = {}) {
    const defaultConfig = {
        watchDir: process.env.WATCH_DIR || process.cwd(),
        excludedDirs: (process.env.EXCLUDED_DIRS || '').split(',').filter(Boolean),
        watchExtensions: (process.env.WATCH_EXTENSIONS || 'js,ts,jsx,tsx,json,md').split(','),
        processingDelay: parseInt(process.env.PROCESSING_DELAY || '100'),
        persistent: true,
        ignoreInitial: false,
    };
    const finalConfig = { ...defaultConfig, ...config };
    // Validate configuration
    Utils.validateConfig(finalConfig, ConfigSchemas.watcherConfig);
    return new Watcher(finalConfig);
}
export default Watcher;
//# sourceMappingURL=watcher.js.map