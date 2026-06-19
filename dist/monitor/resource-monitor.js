import * as os from "os";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("monitor");
const DEFAULT_CONFIG = {
    intervalMs: 5_000,
    cpuWarnThreshold: 70,
    cpuCritThreshold: 90,
    memWarnThreshold: 80,
    memCritThreshold: 95,
    heapWarnMB: 500,
    logStats: true,
    cooldownMs: 60_000,
};
/**
 * Lightweight resource monitor for the watcher service.
 * Tracks CPU, memory, and heap usage with configurable thresholds.
 */
export class ResourceMonitor {
    config;
    timer = null;
    prevCpuIdle = 0;
    prevCpuTotal = 0;
    prevCpuTime = 0;
    snapshots = [];
    maxSnapshots = 60; // keep last 60 snapshots (30 min at 30s interval)
    consecutiveWarnCount = 0;
    consecutiveCritCount = 0;
    lastCpuWarnAt = 0;
    lastCpuCritAt = 0;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Start periodic monitoring
     */
    start() {
        if (this.timer)
            return;
        // Initialize CPU baseline
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        }
        this.prevCpuIdle = idle;
        this.prevCpuTotal = total;
        this.prevCpuTime = Date.now();
        // Use recursive setTimeout instead of setInterval for reliability
        const poll = () => {
            this.collect();
            this.timer = setTimeout(poll, this.config.intervalMs);
            this.timer.unref();
        };
        this.timer = setTimeout(poll, this.config.intervalMs);
        this.timer.unref();
        logger.info(`Resource monitor started (interval: ${this.config.intervalMs / 1000}s)`);
    }
    /**
     * Stop monitoring
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
            logger.info("Resource monitor stopped");
        }
    }
    /**
     * Get the latest snapshot
     */
    getSnapshot() {
        return this.snapshots.length > 0
            ? this.snapshots[this.snapshots.length - 1]
            : null;
    }
    /**
     * Get all snapshots
     */
    getSnapshots() {
        return [...this.snapshots];
    }
    /**
     * Get average CPU over last N snapshots
     */
    getAvgCpu(lastN = 5) {
        const recent = this.snapshots.slice(-lastN);
        if (recent.length === 0)
            return 0;
        return (recent.reduce((sum, s) => sum + s.cpu.usagePercent, 0) / recent.length);
    }
    /**
     * Get peak memory usage
     */
    getPeakMemory() {
        if (this.snapshots.length === 0)
            return 0;
        return Math.max(...this.snapshots.map((s) => s.memory.usagePercent));
    }
    /**
     * Collect a resource snapshot
     */
    collect() {
        try {
            const snapshot = {
                timestamp: new Date(),
                cpu: this.measureCpu(),
                memory: this.measureMemory(),
                heap: this.measureHeap(),
                uptime: os.uptime(),
                loadAvg: os.loadavg(),
            };
            this.snapshots.push(snapshot);
            if (this.snapshots.length > this.maxSnapshots) {
                this.snapshots.shift();
            }
            this.checkThresholds(snapshot);
            if (this.config.logStats) {
                this.logSnapshot(snapshot);
            }
        }
        catch (error) {
            logger.error("Failed to collect resource snapshot:", error);
        }
    }
    /**
     * Measure CPU usage percentage (delta-based)
     */
    measureCpu() {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        }
        const idleDiff = idle - this.prevCpuIdle;
        const totalDiff = total - this.prevCpuTotal;
        const usagePercent = totalDiff > 0
            ? Math.round(((totalDiff - idleDiff) / totalDiff) * 100)
            : 0;
        this.prevCpuIdle = idle;
        this.prevCpuTotal = total;
        return {
            usagePercent: Math.max(0, Math.min(100, usagePercent)),
            cores: cpus.length,
            model: cpus[0]?.model || "unknown",
        };
    }
    /**
     * Measure system memory usage
     */
    measureMemory() {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return {
            totalMB: Math.round(total / 1024 / 1024),
            usedMB: Math.round(used / 1024 / 1024),
            freeMB: Math.round(free / 1024 / 1024),
            usagePercent: Math.round((used / total) * 100),
        };
    }
    /**
     * Measure Node.js heap usage
     */
    measureHeap() {
        const mem = process.memoryUsage();
        return {
            usedMB: Math.round(mem.heapUsed / 1024 / 1024),
            totalMB: Math.round(mem.heapTotal / 1024 / 1024),
            limitMB: Math.round(mem.rss / 1024 / 1024),
            usagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
        };
    }
    /**
     * Check thresholds and log warnings/criticals
     */
    checkThresholds(snap) {
        // CPU warnings with debounce
        const now = Date.now();
        if (snap.cpu.usagePercent >= this.config.cpuCritThreshold) {
            this.consecutiveCritCount++;
            this.consecutiveWarnCount = 0;
            if (this.consecutiveCritCount >= 3 && (now - this.lastCpuCritAt) >= this.config.cooldownMs) {
                logger.error(`CPU CRITICAL: ${snap.cpu.usagePercent}% (threshold: ${this.config.cpuCritThreshold}%)`);
                this.lastCpuCritAt = now;
            }
        }
        else if (snap.cpu.usagePercent >= this.config.cpuWarnThreshold) {
            this.consecutiveWarnCount++;
            this.consecutiveCritCount = 0;
            if (this.consecutiveWarnCount >= 6 && (now - this.lastCpuWarnAt) >= this.config.cooldownMs) {
                logger.warn(`CPU HIGH: ${snap.cpu.usagePercent}% (threshold: ${this.config.cpuWarnThreshold}%)`);
                this.lastCpuWarnAt = now;
            }
        }
        else {
            this.consecutiveWarnCount = 0;
            this.consecutiveCritCount = 0;
        }
        // Memory warnings
        if (snap.memory.usagePercent >= this.config.memCritThreshold) {
            logger.error(`MEMORY CRITICAL: ${snap.memory.usagePercent}% used (${snap.memory.usedMB}/${snap.memory.totalMB} MB)`);
        }
        else if (snap.memory.usagePercent >= this.config.memWarnThreshold) {
            logger.warn(`MEMORY HIGH: ${snap.memory.usagePercent}% used (${snap.memory.usedMB}/${snap.memory.totalMB} MB)`);
        }
        // Heap warnings
        if (snap.heap.usedMB >= this.config.heapWarnMB) {
            logger.warn(`HEAP HIGH: ${snap.heap.usedMB} MB used (limit: ${this.config.heapWarnMB} MB)`);
        }
    }
    /**
     * Log snapshot at debug level
     */
    logSnapshot(snap) {
        logger.debug(`CPU: ${snap.cpu.usagePercent}% | ` +
            `MEM: ${snap.memory.usedMB}/${snap.memory.totalMB} MB (${snap.memory.usagePercent}%) | ` +
            `Heap: ${snap.heap.usedMB} MB | ` +
            `Load: ${snap.loadAvg[0].toFixed(2)}`);
    }
}
/**
 * Create a resource monitor with default config
 */
export function createResourceMonitor(config) {
    return new ResourceMonitor(config);
}
//# sourceMappingURL=resource-monitor.js.map