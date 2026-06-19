import fs from "fs";
import path from "path";
import EventEmitter from "events";
import { createHash } from "crypto";
import { Utils, ConfigSchemas } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("detection");
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
/** Default directories to always ignore — these NEVER need watching */
const ALWAYS_IGNORED = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".cache",
    ".next",
    ".nuxt",
    "coverage",
    "__pycache__",
    ".DS_Store",
    ".vs",
    ".idea",
    "out",
    ".turbo",
    ".vercel",
    ".fix-reports",
    ".kilocode",
];
/**
 * Parse a .watchignore file (gitignore-style syntax).
 * Supports:
 *  - Comments (#)
 *  - Empty lines
 *  - Exact names:  node_modules
 *  - Suffix match:  *.log
 *  - Directory match:  dist/ (matches "dist" anywhere in path)
 */
function parseWatchIgnore(content) {
    const patterns = [];
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        patterns.push(line);
    }
    return patterns;
}
/**
 * Load .watchignore from a directory. Returns empty array if not found.
 */
function loadWatchIgnore(dir) {
    const ignoreFile = path.join(dir, ".watchignore");
    try {
        const content = fs.readFileSync(ignoreFile, "utf-8");
        const patterns = parseWatchIgnore(content);
        if (patterns.length > 0) {
            logger.info(`Loaded ${patterns.length} patterns from .watchignore`);
        }
        return patterns;
    }
    catch {
        return [];
    }
}
/**
 * Check if a path segment or filename matches a watchignore pattern.
 */
function matchesWatchIgnorePattern(part, patterns) {
    for (const pattern of patterns) {
        // Exact name match: "node_modules", ".git", etc.
        if (pattern === part)
            return true;
        // Suffix match: "*.log", "*.map", "*.tmp"
        if (pattern.startsWith("*")) {
            const suffix = pattern.slice(1); // ".log"
            if (part.endsWith(suffix))
                return true;
        }
        // Prefix match: "temp*"
        if (pattern.endsWith("*") && !pattern.startsWith("*")) {
            const prefix = pattern.slice(0, -1);
            if (part.startsWith(prefix))
                return true;
        }
    }
    return false;
}
/**
 * File watcher class that monitors file system changes.
 *
 * Uses native fs.watch({ recursive: true }) which creates
 * a single ReadDirectoryChangesW handle instead of one per subdirectory.
 */
export class Watcher extends EventEmitter {
    nativeWatcher = null;
    config;
    processingQueue = new Map();
    pendingEvents = new Map();
    maxQueueSize;
    watchedCount = 0;
    ignoredDirs;
    ignoredExtensions;
    watchIgnorePatterns = [];
    recentlyEmitted = new Map();
    recentlyEmittedTTL = 60_000;
    scanCompletePromise = null;
    resolveScanComplete = null;
    running = false;
    constructor(config) {
        super();
        this.config = config;
        this.maxQueueSize = config.maxQueueSize || 1000;
        // Build fast lookup sets for filtering (O(1) checks)
        this.ignoredDirs = new Set([...config.excludedDirs]);
        this.ignoredExtensions = new Set([".log", ".map"]);
        this.scanCompletePromise = new Promise((resolve) => {
            this.resolveScanComplete = resolve;
        });
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
            // Load .watchignore file
            this.watchIgnorePatterns = loadWatchIgnore(this.config.watchDir);
            // Use native fs.watch with recursive
            this.nativeWatcher = fs.watch(this.config.watchDir, { recursive: true }, (eventType, filename) => {
                if (!filename)
                    return;
                this.handleNativeEvent(eventType, filename).catch((err) => {
                    logger.error("Error handling native event:", err);
                });
            });
            this.nativeWatcher.on("error", (error) => {
                logger.error("Watcher error:", error);
                this.emit(WatcherEvent.WATCHER_ERROR, error);
            });
            // Signal ready immediately (native watcher has no scan phase)
            process.nextTick(() => {
                const ignoreCount = this.watchIgnorePatterns.length;
                const alwaysCount = ALWAYS_IGNORED.length;
                logger.success(`Watcher started (native fs.watch) — ignoring ${alwaysCount} defaults + ${ignoreCount} .watchignore patterns`);
                this.emit(WatcherEvent.WATCHER_READY);
            });
            this.running = true;
            // Initial scan in background (non-blocking)
            this.scanInitialFiles().catch((err) => {
                logger.error("Initial scan failed:", err);
            });
        }
        catch (error) {
            logger.error("Failed to start watcher:", error);
            this.emit(WatcherEvent.WATCHER_ERROR, error);
            throw error;
        }
    }
    /**
     * Stop watching and clean up resources
     */
    async stop() {
        try {
            if (this.nativeWatcher) {
                logger.info("Stopping watcher...");
                // Clear any pending processing timers
                this.processingQueue.forEach((timeout) => clearTimeout(timeout));
                this.processingQueue.clear();
                this.pendingEvents.clear();
                this.nativeWatcher.close();
                this.nativeWatcher = null;
                this.running = false;
                logger.success("Watcher stopped successfully");
            }
        }
        catch (error) {
            logger.error("Error stopping watcher:", error);
            throw error;
        }
    }
    /**
     * Recursively count files matching watched extensions.
     * If processExisting is enabled, emit FILE_ADDED for each file (with delay to prevent CPU flood).
     * Otherwise, just count — only real-time changes from fs.watch trigger the pipeline.
     */
    async scanInitialFiles() {
        const count = { files: 0, dirs: 0 };
        const files = [];
        const walk = async (dir) => {
            let entries;
            try {
                entries = await fs.promises.readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const relativePath = path.relative(this.config.watchDir, path.join(dir, entry.name));
                const normalized = relativePath.replace(/\\/g, "/");
                if (this.isIgnored(normalized))
                    continue;
                if (entry.isDirectory()) {
                    count.dirs++;
                    await walk(path.join(dir, entry.name));
                }
                else {
                    const ext = path.extname(normalized).slice(1).toLowerCase();
                    if (this.config.watchExtensions.includes(ext)) {
                        count.files++;
                        files.push(normalized);
                    }
                }
            }
        };
        await walk(this.config.watchDir);
        this.watchedCount = count.files;
        this.resolveScanComplete?.({ fileCount: count.files });
        logger.info(`Initial scan: ${count.files} files in ${count.dirs} directories`);
        // If processExisting is enabled, emit FILE_ADDED for each file
        if (this.config.processExisting && files.length > 0) {
            const delay = this.config.processExistingDelay || 10;
            logger.info(`Processing ${files.length} existing files (delay: ${delay}ms each)...`);
            for (let i = 0; i < files.length; i++) {
                const relativePath = files[i];
                const absolutePath = path.resolve(this.config.watchDir, relativePath);
                // Compute content hash so subsequent fs.watch events can detect
                // whether prettier/ESLint actually changed the file content.
                const content = await fs.promises.readFile(absolutePath, "utf-8").catch(() => "");
                const contentHash = createHash("sha256").update(content).digest("hex");
                this.recentlyEmitted.set(relativePath, { timestamp: Date.now(), contentHash });
                this.emit(WatcherEvent.FILE_ADDED, {
                    filePath: absolutePath,
                    relativePath,
                    extension: Utils.getFileExtension(absolutePath),
                    timestamp: new Date(),
                });
                // Yield to event loop between files to prevent CPU flood
                if (i < files.length - 1) {
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
            logger.info(`Finished processing ${files.length} existing files`);
            // Clean up stale cooldown entries after scan completes
            const cutoff = Date.now() - this.recentlyEmittedTTL;
            for (const [key, entry] of this.recentlyEmitted) {
                if (entry.timestamp < cutoff)
                    this.recentlyEmitted.delete(key);
            }
        }
    }
    /**
     * Handle an event from native fs.watch.
     * Filename is relative to the watched directory.
     */
    async handleNativeEvent(eventType, relativePath) {
        // Normalize separators
        const normalized = relativePath.replace(/\\/g, "/");
        // Fast-path ignore check: skip ignored directories early
        if (this.isIgnored(normalized)) {
            return;
        }
        // Check file extension
        const ext = path.extname(normalized).slice(1).toLowerCase();
        if (!this.config.watchExtensions.includes(ext)) {
            return;
        }
        // Content-hash cooldown: skip fs.watch events when the file content hasn't actually
        // changed (e.g. prettier/ESLint wrote the same content back). Also skip stale entries
        // older than TTL.
        const stored = this.recentlyEmitted.get(normalized);
        if (stored && (Date.now() - stored.timestamp) < this.recentlyEmittedTTL) {
            const absPath = path.join(this.config.watchDir, normalized);
            const currentContent = await fs.promises.readFile(absPath, "utf-8").catch(() => "");
            const currentHash = createHash("sha256").update(currentContent).digest("hex");
            if (currentHash === stored.contentHash) {
                logger.debug(`Cooldown: content unchanged, skipping ${normalized}`);
                return;
            }
        }
        // Map eventType to WatcherEvent
        let event;
        if (eventType === "rename") {
            const absPath = path.join(this.config.watchDir, normalized);
            try {
                fs.accessSync(absPath);
                event = WatcherEvent.FILE_ADDED;
            }
            catch {
                event = WatcherEvent.FILE_DELETED;
            }
        }
        else {
            event = WatcherEvent.FILE_CHANGED;
        }
        this.handleFileEvent(event, normalized);
    }
    /**
     * Check if a relative path should be ignored.
     * Checks: ALWAYS_IGNORED, excludedDirs, .watchignore patterns, ignored extensions.
     */
    isIgnored(relativePath) {
        const parts = relativePath.split("/");
        for (const part of parts) {
            // Check hardcoded always-ignored
            if (ALWAYS_IGNORED.includes(part))
                return true;
            // Check excludedDirs
            if (this.ignoredDirs.has(part))
                return true;
            // Check .watchignore patterns
            if (matchesWatchIgnorePattern(part, this.watchIgnorePatterns)) {
                return true;
            }
        }
        // Check ignored extensions
        const ext = path.extname(relativePath);
        if (this.ignoredExtensions.has(ext))
            return true;
        return false;
    }
    /**
     * Handle file events with debouncing.
     * FILE_ADDED has priority over FILE_CHANGED for the same file.
     */
    handleFileEvent(event, filePath) {
        logger.debug(`File event: ${event} - ${filePath}`);
        // If this file already has a pending timer, keep the higher-priority event
        const existingEvent = this.pendingEvents.get(filePath);
        if (existingEvent) {
            const priority = {
                [WatcherEvent.FILE_ADDED]: 3,
                [WatcherEvent.FILE_DELETED]: 2,
                [WatcherEvent.FILE_CHANGED]: 1,
            };
            if ((priority[event] || 0) <= (priority[existingEvent] || 0)) {
                return;
            }
            const existingTimer = this.processingQueue.get(filePath);
            if (existingTimer)
                clearTimeout(existingTimer);
        }
        this.pendingEvents.set(filePath, event);
        // LRU eviction
        if (this.processingQueue.size >= this.maxQueueSize &&
            !this.processingQueue.has(filePath)) {
            const oldestKey = this.processingQueue.keys().next().value;
            if (oldestKey) {
                const oldestTimer = this.processingQueue.get(oldestKey);
                if (oldestTimer)
                    clearTimeout(oldestTimer);
                this.processingQueue.delete(oldestKey);
                this.pendingEvents.delete(oldestKey);
                logger.warn(`Queue full (${this.maxQueueSize}), evicted oldest: ${oldestKey}`);
            }
        }
        const timer = setTimeout(() => {
            this.processingQueue.delete(filePath);
            const finalEvent = this.pendingEvents.get(filePath) || event;
            this.pendingEvents.delete(filePath);
            this.processFileEvent(finalEvent, filePath);
        }, this.config.processingDelay);
        this.processingQueue.set(filePath, timer);
    }
    /**
     * Process the actual file event
     */
    processFileEvent(event, filePath) {
        const absolutePath = path.resolve(this.config.watchDir, filePath);
        if (event === WatcherEvent.FILE_ADDED) {
            this.watchedCount++;
        }
        else if (event === WatcherEvent.FILE_DELETED) {
            this.watchedCount--;
        }
        logger.info(`${event} - ${absolutePath}`);
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
        if (!this.nativeWatcher) {
            return { isRunning: false, watchedFiles: 0 };
        }
        return { isRunning: this.running, watchedFiles: this.watchedCount };
    }
    /**
     * Wait for the initial scan to complete
     */
    async waitForScanComplete() {
        return this.scanCompletePromise;
    }
}
/**
 * Factory function to create a watcher instance
 */
export function createWatcher(config = {}) {
    const defaultConfig = {
        watchDir: process.env.WATCH_DIR || process.cwd(),
        excludedDirs: (process.env.EXCLUDED_DIRS || "").split(",").filter(Boolean),
        watchExtensions: (process.env.WATCH_EXTENSIONS || "js,ts,jsx,tsx,json,md").split(","),
        processingDelay: parseInt(process.env.PROCESSING_DELAY || "100"),
        persistent: true,
        ignoreInitial: false,
        processExisting: false,
        processExistingDelay: 10,
    };
    const finalConfig = { ...defaultConfig, ...config };
    // Validate configuration
    Utils.validateConfig(finalConfig, ConfigSchemas.watcherConfig);
    return new Watcher(finalConfig);
}
export default Watcher;
//# sourceMappingURL=watcher.js.map