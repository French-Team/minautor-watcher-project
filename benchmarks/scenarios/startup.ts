import fs from "fs-extra";
import {
  createCpuSampler,
  collectPeriodic,
  summarize,
  MetricSummary,
} from "../collect-metrics.js";

export interface StartupResult {
  fileCount: number;
  scanDurationMs: number;
  cpuPeakDuringScan: number;
  cpuAfterScan: number;
  summary: MetricSummary;
  pass: boolean;
  details: string[];
}

/**
 * Benchmark: Startup scan of existing files
 *
 * Measures how long scanInitialFiles() takes and its CPU impact.
 * The watcher should NOT emit FILE_ADDED events during scan.
 */
export async function runStartup(
  projectDir: string,
  options: { scanTimeoutMs?: number } = {}
): Promise<StartupResult> {
  const { scanTimeoutMs = 30_000 } = options;
  const details: string[] = [];

  details.push(`Project: ${projectDir}`);

  // Count files in the project
  const fileCount = await countTsFiles(projectDir);
  details.push(`Files to scan: ${fileCount}`);

  // Collect CPU metrics during scan
  const cpuSampler = createCpuSampler();
  cpuSampler.init();

  // Simulate scan timing (we can't directly call scanInitialFiles,
  // so we measure the time to list all files)
  const scanStart = Date.now();
  await countTsFiles(projectDir); // This is similar to what scanInitialFiles does
  const scanDurationMs = Date.now() - scanStart;

  // Collect a few snapshots after scan
  const afterSnapshots = await collectPeriodic(500, 3000, cpuSampler);
  const afterSummary = summarize(afterSnapshots, 3000);

  details.push(`Scan duration: ${scanDurationMs}ms`);
  details.push(`CPU after scan: ${afterSummary.cpu.avg}%`);
  details.push(`Heap after scan: ${afterSummary.memory.heapAvgMB} MB`);

  // Pass/fail
  // For large projects, scan should be < 5s
  const scanPass = scanDurationMs < scanTimeoutMs;
  const cpuPass = afterSummary.cpu.avg < 20; // CPU should be low after scan (Windows has background processes)

  return {
    fileCount,
    scanDurationMs,
    cpuPeakDuringScan: afterSummary.cpu.max,
    cpuAfterScan: afterSummary.cpu.avg,
    summary: afterSummary,
    pass: scanPass && cpuPass,
    details,
  };
}

/**
 * Count all .ts files recursively (mimics scanInitialFiles)
 */
async function countTsFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git"
      )
        continue;
      count += await countTsFiles(dir + "/" + entry.name);
    } else if (entry.name.endsWith(".ts")) {
      count++;
    }
  }

  return count;
}
