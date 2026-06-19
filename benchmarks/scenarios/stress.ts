import {
  createCpuSampler,
  collectPeriodic,
  summarize,
  MetricSummary,
} from "../collect-metrics.js";
import { modifyFiles } from "../fixtures/modify-files.js";

export interface StressResult {
  summary: MetricSummary;
  filesModified: number;
  recoveryTimeMs: number;
  cpuAfterRecovery: number;
  pass: boolean;
  details: string[];
}

/**
 * Benchmark: Stress test with extreme load
 *
 * Modifies 500+ files rapidly and measures:
 * - Peak CPU and memory
 * - Recovery time (CPU back to < 5% after load)
 * - No crashes or errors
 */
export async function runStress(
  projectDir: string,
  options: { fileCount?: number; recoveryTimeoutMs?: number } = {}
): Promise<StressResult> {
  const { fileCount = 500, recoveryTimeoutMs = 15_000 } = options;
  const details: string[] = [];

  details.push(`Project: ${projectDir}`);
  details.push(`Files to modify: ${fileCount}`);

  // Collect baseline
  const cpuSampler = createCpuSampler();
  cpuSampler.init();

  details.push(`Baseline collected`);

  // Burst: modify all files as fast as possible
  details.push(`Starting burst modification...`);
  const modifyResult = await modifyFiles({
    projectDir,
    count: fileCount,
    delayMs: 0, // All at once
  });

  details.push(
    `Modified ${modifyResult.modified}/${fileCount} files in ${modifyResult.duration}ms`
  );

  // Collect metrics during and after processing
  details.push(`Collecting metrics during processing...`);
  const processingSnapshots = await collectPeriodic(500, 10_000, cpuSampler);

  const processingSummary = summarize(processingSnapshots, 10_000);
  details.push(`CPU peak during processing: ${processingSummary.cpu.max}%`);
  details.push(`Heap peak: ${processingSummary.memory.heapPeakMB} MB`);
  details.push(`RSS peak: ${processingSummary.memory.rssPeakMB} MB`);

  // Wait for recovery
  details.push(`Waiting for recovery...`);
  const recoveryStart = Date.now();
  let cpuAfterRecovery = 100;

  while (Date.now() - recoveryStart < recoveryTimeoutMs) {
    const snap = collectPeriodic(500, 500, cpuSampler);
    const snaps = await snap;
    if (snaps.length > 0) {
      cpuAfterRecovery = snaps[snaps.length - 1].cpu.usagePercent;
      if (cpuAfterRecovery < 5) {
        details.push(
          `CPU recovered to ${cpuAfterRecovery}% after ${
            Date.now() - recoveryStart
          }ms`
        );
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const recoveryTimeMs = Date.now() - recoveryStart;
  if (cpuAfterRecovery >= 5) {
    details.push(
      `WARNING: CPU did not recover to <5% within ${recoveryTimeoutMs}ms (current: ${cpuAfterRecovery}%)`
    );
  }

  // Pass/fail
  const memoryPass = processingSummary.memory.rssPeakMB < 300; // < 300 MB
  const recoveryPass = cpuAfterRecovery < 10; // < 10% after recovery
  const modifiedPass = modifyResult.modified === fileCount;

  details.push(`\n--- Verdict ---`);
  details.push(
    `Memory OK: ${memoryPass} (peak: ${processingSummary.memory.rssPeakMB} MB)`
  );
  details.push(`Recovery OK: ${recoveryPass} (CPU: ${cpuAfterRecovery}%)`);
  details.push(`All files modified: ${modifiedPass}`);

  return {
    summary: processingSummary,
    filesModified: modifyResult.modified,
    recoveryTimeMs,
    cpuAfterRecovery,
    pass: memoryPass && recoveryPass && modifiedPass,
    details,
  };
}
