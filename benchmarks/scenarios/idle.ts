import fs from "fs-extra";
import {
  createCpuSampler,
  collectPeriodic,
  summarize,
  MetricSummary,
} from "../collect-metrics.js";

export interface IdleResult {
  summary: MetricSummary;
  pass: boolean;
  details: string[];
}

/**
 * Benchmark: Watcher at idle (no file changes)
 *
 * Measures CPU and memory consumption when the watcher is running
 * but nothing is happening.
 */
export async function runIdle(
  projectDir: string,
  options: { durationMs?: number; intervalMs?: number } = {}
): Promise<IdleResult> {
  const { durationMs = 30_000, intervalMs = 1_000 } = options;
  const details: string[] = [];

  // Ensure project exists
  if (!(await fs.pathExists(projectDir))) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }

  details.push(`Project: ${projectDir}`);
  details.push(`Duration: ${durationMs / 1000}s, Interval: ${intervalMs}ms`);

  // Collect metrics at idle
  const cpuSampler = createCpuSampler();
  const snapshots = await collectPeriodic(intervalMs, durationMs, cpuSampler);
  const summary = summarize(snapshots, durationMs);

  // Evaluate pass/fail
  const cpuPass = summary.cpu.avg < 25; // < 25% avg (Windows has background processes)
  const heapPass = summary.memory.heapPeakMB < 100; // < 100 MB peak

  details.push(`CPU avg: ${summary.cpu.avg}% (max: ${summary.cpu.max}%)`);
  details.push(`Heap peak: ${summary.memory.heapPeakMB} MB`);
  details.push(`RSS peak: ${summary.memory.rssPeakMB} MB`);
  details.push(`Samples: ${summary.cpu.samples}`);

  return {
    summary,
    pass: cpuPass && heapPass,
    details,
  };
}
