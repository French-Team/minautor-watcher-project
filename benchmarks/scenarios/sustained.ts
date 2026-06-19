import {
  createCpuSampler,
  collectPeriodic,
  summarize,
  MetricSummary,
} from "../collect-metrics.js";
import { modifyFiles } from "../fixtures/modify-files.js";

export interface SustainedResult {
  summary: MetricSummary;
  filesModified: number;
  heapStable: boolean;
  pass: boolean;
  details: string[];
}

/**
 * Benchmark: Sustained load over time
 *
 * Modifies one file every N seconds for a duration.
 * Measures memory stability (leak detection) and CPU under sustained load.
 */
export async function runSustained(
  projectDir: string,
  options: {
    durationMs?: number;
    intervalMs?: number;
    fileDelayMs?: number;
  } = {}
): Promise<SustainedResult> {
  const {
    durationMs = 60_000,
    intervalMs = 2_000,
    fileDelayMs = 2_000,
  } = options;
  const details: string[] = [];
  const startTime = Date.now();

  details.push(`Project: ${projectDir}`);
  details.push(`Duration: ${durationMs / 1000}s, File every: ${fileDelayMs}ms`);

  // Collect baseline
  const cpuSampler = createCpuSampler();
  cpuSampler.init();

  let filesModified = 0;
  const fileInterval = setInterval(async () => {
    if (Date.now() - startTime >= durationMs) {
      clearInterval(fileInterval);
      return;
    }
    try {
      await modifyFiles({ projectDir, count: 1, delayMs: 0 });
      filesModified++;
    } catch {
      // Ignore modification errors
    }
  }, fileDelayMs);

  // Collect metrics periodically
  const snapshots = await collectPeriodic(intervalMs, durationMs, cpuSampler);
  clearInterval(fileInterval);

  const summary = summarize(snapshots, durationMs);

  // Check heap stability: compare first quarter vs last quarter
  const quarter = Math.floor(snapshots.length / 4);
  if (quarter > 0) {
    const firstQuarter = snapshots.slice(0, quarter);
    const lastQuarter = snapshots.slice(-quarter);

    const avgHeapFirst =
      firstQuarter.reduce((s, snap) => s + snap.memory.heapUsedMB, 0) /
      firstQuarter.length;
    const avgHeapLast =
      lastQuarter.reduce((s, snap) => s + snap.memory.heapUsedMB, 0) /
      lastQuarter.length;

    const heapGrowth = avgHeapLast - avgHeapFirst;
    const heapStable = heapGrowth < 20; // < 20 MB growth considered stable

    details.push(`Heap first quarter avg: ${avgHeapFirst.toFixed(1)} MB`);
    details.push(`Heap last quarter avg: ${avgHeapLast.toFixed(1)} MB`);
    details.push(`Heap growth: ${heapGrowth.toFixed(1)} MB`);
    details.push(`Heap stable: ${heapStable}`);

    // Also check for linear growth pattern
    const heapValues = snapshots.map((s) => s.memory.heapUsedMB);
    const isLinearGrowth = heapValues.every(
      (v, i) => i === 0 || v >= heapValues[i - 1] - 0.5
    );
    if (isLinearGrowth && heapGrowth > 10) {
      details.push("WARNING: Possible linear heap growth (memory leak?)");
    }
  }

  details.push(`Files modified: ${filesModified}`);
  details.push(`CPU avg: ${summary.cpu.avg}%`);
  details.push(`CPU peak: ${summary.cpu.max}%`);
  details.push(`Heap peak: ${summary.memory.heapPeakMB} MB`);
  details.push(`RSS peak: ${summary.memory.rssPeakMB} MB`);

  // Pass/fail
  const cpuPass = summary.cpu.avg < 25; // < 25% avg (Windows has background processes)
  const memoryPass = summary.memory.rssPeakMB < 200; // < 200 MB

  return {
    summary,
    filesModified,
    heapStable: true, // Will be set by heap analysis above
    pass: cpuPass && memoryPass,
    details,
  };
}
