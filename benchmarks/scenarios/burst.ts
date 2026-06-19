import {
  createCpuSampler,
  collectSnapshot,
  MetricSnapshot,
} from "../collect-metrics.js";
import { modifyFiles } from "../fixtures/modify-files.js";

export interface BurstResult {
  throughput: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  cpuPeak: number;
  cpuAvg: number;
  heapPeakMB: number;
  rssPeakMB: number;
  filesModified: number;
  duration: number;
  pass: boolean;
  details: string[];
}

/**
 * Benchmark: Burst of file modifications
 *
 * Modifies N files rapidly and measures how fast the watcher processes them.
 * Simulates a git pull or large save operation.
 */
export async function runBurst(
  projectDir: string,
  options: { fileCount?: number; delayMs?: number } = {}
): Promise<BurstResult> {
  const { fileCount = 100, delayMs = 0 } = options;
  const details: string[] = [];
  const startTime = Date.now();

  details.push(`Project: ${projectDir}`);
  details.push(`Files to modify: ${fileCount}, Delay: ${delayMs}ms`);

  // Collect baseline metrics
  const cpuSampler = createCpuSampler();
  cpuSampler.init();
  const baseline = collectSnapshot(cpuSampler);
  details.push(
    `Baseline: CPU=${baseline.cpu.usagePercent}%, Heap=${baseline.memory.heapUsedMB} MB`
  );

  // Modify files (trigger the watcher)
  const modifyResult = await modifyFiles({
    projectDir,
    count: fileCount,
    delayMs,
  });
  details.push(
    `Modified: ${modifyResult.modified}/${fileCount} files in ${modifyResult.duration}ms`
  );

  // Wait for processing to complete (poll until stable)
  const waitForStable = async (
    stableMs: number = 3000
  ): Promise<MetricSnapshot[]> => {
    const snapshots: MetricSnapshot[] = [];
    let lastChange = Date.now();
    let prevHeap = 0;

    while (Date.now() - lastChange < stableMs) {
      const snap = collectSnapshot(cpuSampler);
      snapshots.push(snap);

      // Check if heap changed significantly (> 1 MB)
      if (Math.abs(snap.memory.heapUsedMB - prevHeap) > 1) {
        lastChange = Date.now();
        prevHeap = snap.memory.heapUsedMB;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return snapshots;
  };

  details.push("Waiting for processing to stabilize...");
  const processingSnapshots = await waitForStable();
  const totalDuration = Date.now() - startTime;

  // Calculate metrics
  const cpuValues = processingSnapshots.map((s) => s.cpu.usagePercent);
  const cpuPeak = Math.max(...cpuValues);
  const cpuAvg = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
  const heapPeakMB = Math.max(
    ...processingSnapshots.map((s) => s.memory.heapUsedMB)
  );
  const rssPeakMB = Math.max(...processingSnapshots.map((s) => s.memory.rssMB));

  const throughput = (modifyResult.modified / totalDuration) * 1000; // files/sec
  const avgLatencyMs = totalDuration / modifyResult.modified;

  details.push(`Throughput: ${throughput.toFixed(1)} files/s`);
  details.push(`Avg latency: ${avgLatencyMs.toFixed(1)} ms/file`);
  details.push(`CPU peak: ${cpuPeak}%`);
  details.push(`CPU avg: ${cpuAvg.toFixed(1)}%`);
  details.push(`Heap peak: ${heapPeakMB} MB`);
  details.push(`RSS peak: ${rssPeakMB} MB`);
  details.push(`Total duration: ${totalDuration}ms`);

  // Pass/fail criteria
  const throughputPass = throughput > 5; // > 5 files/s
  const cpuPass = cpuPeak < 80; // < 80% peak
  const memoryPass = rssPeakMB < 200; // < 200 MB RSS

  return {
    throughput,
    avgLatencyMs,
    maxLatencyMs: totalDuration,
    cpuPeak,
    cpuAvg,
    heapPeakMB,
    rssPeakMB,
    filesModified: modifyResult.modified,
    duration: totalDuration,
    pass: throughputPass && cpuPass && memoryPass,
    details,
  };
}
