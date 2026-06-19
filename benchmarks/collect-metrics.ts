import * as os from "os";

export interface MetricSnapshot {
  timestamp: number;
  cpu: {
    usagePercent: number;
    cores: number;
  };
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
}

export interface MetricSummary {
  cpu: {
    min: number;
    max: number;
    avg: number;
    samples: number;
  };
  memory: {
    heapPeakMB: number;
    rssPeakMB: number;
    heapAvgMB: number;
    rssAvgMB: number;
    samples: number;
  };
  duration: number;
}

/**
 * CPU measurement state (delta-based)
 */
class CpuSampler {
  private prevIdle = 0;
  private prevTotal = 0;
  private initialized = false;

  /**
   * Initialize the CPU baseline (call once)
   */
  init(): void {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    }
    this.prevIdle = idle;
    this.prevTotal = total;
    this.initialized = true;
  }

  /**
   * Sample CPU usage since last call
   */
  sample(): number {
    if (!this.initialized) this.init();

    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    }

    const idleDiff = idle - this.prevIdle;
    const totalDiff = total - this.prevTotal;

    this.prevIdle = idle;
    this.prevTotal = total;

    if (totalDiff === 0) return 0;
    const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
    return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
  }
}

/**
 * Collect a single metric snapshot
 */
export function collectSnapshot(cpuSampler: CpuSampler): MetricSnapshot {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    cpu: {
      usagePercent: cpuSampler.sample(),
      cores: os.cpus().length,
    },
    memory: {
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      externalMB: Math.round((mem.external / 1024 / 1024) * 10) / 10,
    },
  };
}

/**
 * Create a CPU sampler (reusable across snapshots)
 */
export function createCpuSampler(): CpuSampler {
  return new CpuSampler();
}

/**
 * Periodically collect snapshots
 */
export async function collectPeriodic(
  intervalMs: number,
  durationMs: number,
  cpuSampler: CpuSampler
): Promise<MetricSnapshot[]> {
  const snapshots: MetricSnapshot[] = [];
  const startTime = Date.now();
  cpuSampler.init();

  return new Promise((resolve) => {
    const collect = () => {
      snapshots.push(collectSnapshot(cpuSampler));
      if (Date.now() - startTime < durationMs) {
        setTimeout(collect, intervalMs);
      } else {
        resolve(snapshots);
      }
    };
    collect();
  });
}

/**
 * Summarize an array of snapshots
 */
export function summarize(
  snapshots: MetricSnapshot[],
  durationMs: number
): MetricSummary {
  if (snapshots.length === 0) {
    return {
      cpu: { min: 0, max: 0, avg: 0, samples: 0 },
      memory: {
        heapPeakMB: 0,
        rssPeakMB: 0,
        heapAvgMB: 0,
        rssAvgMB: 0,
        samples: 0,
      },
      duration: durationMs,
    };
  }

  const cpuValues = snapshots.map((s) => s.cpu.usagePercent);
  const heapValues = snapshots.map((s) => s.memory.heapUsedMB);
  const rssValues = snapshots.map((s) => s.memory.rssMB);

  return {
    cpu: {
      min: Math.min(...cpuValues),
      max: Math.max(...cpuValues),
      avg:
        Math.round(
          (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length) * 10
        ) / 10,
      samples: snapshots.length,
    },
    memory: {
      heapPeakMB: Math.max(...heapValues),
      rssPeakMB: Math.max(...rssValues),
      heapAvgMB:
        Math.round(
          (heapValues.reduce((a, b) => a + b, 0) / heapValues.length) * 10
        ) / 10,
      rssAvgMB:
        Math.round(
          (rssValues.reduce((a, b) => a + b, 0) / rssValues.length) * 10
        ) / 10,
      samples: snapshots.length,
    },
    duration: durationMs,
  };
}
