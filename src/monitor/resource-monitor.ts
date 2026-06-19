import * as os from "os";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("monitor");

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

const DEFAULT_CONFIG: MonitorConfig = {
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
export class ResourceMonitor {
  private config: MonitorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private prevCpuIdle: number = 0;
  private prevCpuTotal: number = 0;
  private prevCpuTime: number = 0;
  private snapshots: ResourceSnapshot[] = [];
  private maxSnapshots = 60; // keep last 60 snapshots (30 min at 30s interval)
  private consecutiveWarnCount = 0;
  private consecutiveCritCount = 0;
  private lastCpuWarnAt = 0;
  private lastCpuCritAt = 0;

  constructor(config?: Partial<MonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start periodic monitoring
   */
  start(): void {
    if (this.timer) return;

    // Initialize CPU baseline
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
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

    logger.info(
      `Resource monitor started (interval: ${this.config.intervalMs / 1000}s)`
    );
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      logger.info("Resource monitor stopped");
    }
  }

  /**
   * Get the latest snapshot
   */
  getSnapshot(): ResourceSnapshot | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): ResourceSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get average CPU over last N snapshots
   */
  getAvgCpu(lastN: number = 5): number {
    const recent = this.snapshots.slice(-lastN);
    if (recent.length === 0) return 0;
    return (
      recent.reduce((sum, s) => sum + s.cpu.usagePercent, 0) / recent.length
    );
  }

  /**
   * Get peak memory usage
   */
  getPeakMemory(): number {
    if (this.snapshots.length === 0) return 0;
    return Math.max(...this.snapshots.map((s) => s.memory.usagePercent));
  }

  /**
   * Collect a resource snapshot
   */
  private collect(): void {
    try {
      const snapshot: ResourceSnapshot = {
        timestamp: new Date(),
        cpu: this.measureCpu(),
        memory: this.measureMemory(),
        heap: this.measureHeap(),
        uptime: os.uptime(),
        loadAvg: os.loadavg() as [number, number, number],
      };

      this.snapshots.push(snapshot);
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }

      this.checkThresholds(snapshot);

      if (this.config.logStats) {
        this.logSnapshot(snapshot);
      }
    } catch (error) {
      logger.error("Failed to collect resource snapshot:", error);
    }
  }

  /**
   * Measure CPU usage percentage (delta-based)
   */
  private measureCpu(): {
    usagePercent: number;
    cores: number;
    model: string;
  } {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    }

    const idleDiff = idle - this.prevCpuIdle;
    const totalDiff = total - this.prevCpuTotal;
    const usagePercent =
      totalDiff > 0
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
  private measureMemory(): {
    totalMB: number;
    usedMB: number;
    freeMB: number;
    usagePercent: number;
  } {
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
  private measureHeap(): {
    usedMB: number;
    totalMB: number;
    limitMB: number;
    usagePercent: number;
  } {
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
  private checkThresholds(snap: ResourceSnapshot): void {
    // CPU warnings with debounce
    const now = Date.now();
    if (snap.cpu.usagePercent >= this.config.cpuCritThreshold) {
      this.consecutiveCritCount++;
      this.consecutiveWarnCount = 0;
      if (this.consecutiveCritCount >= 3 && (now - this.lastCpuCritAt) >= this.config.cooldownMs) {
        logger.error(
          `CPU CRITICAL: ${snap.cpu.usagePercent}% (threshold: ${this.config.cpuCritThreshold}%)`
        );
        this.lastCpuCritAt = now;
      }
    } else if (snap.cpu.usagePercent >= this.config.cpuWarnThreshold) {
      this.consecutiveWarnCount++;
      this.consecutiveCritCount = 0;
      if (this.consecutiveWarnCount >= 6 && (now - this.lastCpuWarnAt) >= this.config.cooldownMs) {
        logger.warn(
          `CPU HIGH: ${snap.cpu.usagePercent}% (threshold: ${this.config.cpuWarnThreshold}%)`
        );
        this.lastCpuWarnAt = now;
      }
    } else {
      this.consecutiveWarnCount = 0;
      this.consecutiveCritCount = 0;
    }

    // Memory warnings
    if (snap.memory.usagePercent >= this.config.memCritThreshold) {
      logger.error(
        `MEMORY CRITICAL: ${snap.memory.usagePercent}% used (${snap.memory.usedMB}/${snap.memory.totalMB} MB)`
      );
    } else if (snap.memory.usagePercent >= this.config.memWarnThreshold) {
      logger.warn(
        `MEMORY HIGH: ${snap.memory.usagePercent}% used (${snap.memory.usedMB}/${snap.memory.totalMB} MB)`
      );
    }

    // Heap warnings
    if (snap.heap.usedMB >= this.config.heapWarnMB) {
      logger.warn(
        `HEAP HIGH: ${snap.heap.usedMB} MB used (limit: ${this.config.heapWarnMB} MB)`
      );
    }
  }

  /**
   * Log snapshot at debug level
   */
  private logSnapshot(snap: ResourceSnapshot): void {
    logger.debug(
      `CPU: ${snap.cpu.usagePercent}% | ` +
        `MEM: ${snap.memory.usedMB}/${snap.memory.totalMB} MB (${snap.memory.usagePercent}%) | ` +
        `Heap: ${snap.heap.usedMB} MB | ` +
        `Load: ${snap.loadAvg[0].toFixed(2)}`
    );
  }
}

/**
 * Create a resource monitor with default config
 */
export function createResourceMonitor(
  config?: Partial<MonitorConfig>
): ResourceMonitor {
  return new ResourceMonitor(config);
}
