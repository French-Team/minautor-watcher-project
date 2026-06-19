/**
 * Resource monitoring thresholds
 */
export interface MonitorConfig {
    /** Check interval in ms (default: 30s) */
    intervalMs: number;
    /** CPU usage % to trigger warning (default: 80) */
    cpuWarnThreshold: number;
    /** CPU usage % to trigger critical (default: 95) */
    cpuCritThreshold: number;
    /** Memory usage % to trigger warning (default: 80) */
    memWarnThreshold: number;
    /** Memory usage % to trigger critical (default: 95) */
    memCritThreshold: number;
    /** Heap usage MB to trigger warning (default: 500) */
    heapWarnMB: number;
    /** Log stats periodically (default: true) */
    logStats: boolean;
    /** Cooldown between same-level alerts in ms (default: 60000) */
    cooldownMs: number;
}
/**
 * Snapshot of resource usage at a point in time
 */
export interface ResourceSnapshot {
    timestamp: Date;
    cpu: {
        usagePercent: number;
        cores: number;
        model: string;
    };
    memory: {
        totalMB: number;
        usedMB: number;
        freeMB: number;
        usagePercent: number;
    };
    heap: {
        usedMB: number;
        totalMB: number;
        limitMB: number;
        usagePercent: number;
    };
    uptime: number;
    loadAvg: [number, number, number];
}
/**
 * Lightweight resource monitor for the watcher service.
 * Tracks CPU, memory, and heap usage with configurable thresholds.
 */
export declare class ResourceMonitor {
    private config;
    private timer;
    private prevCpuIdle;
    private prevCpuTotal;
    private prevCpuTime;
    private snapshots;
    private maxSnapshots;
    private consecutiveWarnCount;
    private consecutiveCritCount;
    private lastCpuWarnAt;
    private lastCpuCritAt;
    constructor(config?: Partial<MonitorConfig>);
    /**
     * Start periodic monitoring
     */
    start(): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Get the latest snapshot
     */
    getSnapshot(): ResourceSnapshot | null;
    /**
     * Get all snapshots
     */
    getSnapshots(): ResourceSnapshot[];
    /**
     * Get average CPU over last N snapshots
     */
    getAvgCpu(lastN?: number): number;
    /**
     * Get peak memory usage
     */
    getPeakMemory(): number;
    /**
     * Collect a resource snapshot
     */
    private collect;
    /**
     * Measure CPU usage percentage (delta-based)
     */
    private measureCpu;
    /**
     * Measure system memory usage
     */
    private measureMemory;
    /**
     * Measure Node.js heap usage
     */
    private measureHeap;
    /**
     * Check thresholds and log warnings/criticals
     */
    private checkThresholds;
    /**
     * Log snapshot at debug level
     */
    private logSnapshot;
}
/**
 * Create a resource monitor with default config
 */
export declare function createResourceMonitor(config?: Partial<MonitorConfig>): ResourceMonitor;
//# sourceMappingURL=resource-monitor.d.ts.map