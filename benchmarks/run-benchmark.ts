import path from "path";
import fs from "fs-extra";
import {
  generateProject,
  cleanupProject,
} from "./fixtures/generate-project.js";
import { runIdle } from "./scenarios/idle.js";
import { runBurst } from "./scenarios/burst.js";
import { runSustained } from "./scenarios/sustained.js";
import { runStartup } from "./scenarios/startup.js";
import { runScalability } from "./scenarios/scalability.js";
import { runStress } from "./scenarios/stress.js";
import { formatSummaryTable } from "./reporters/console-reporter.js";
import {
  saveJsonReport,
  saveSummaryReport,
  type JsonReportData,
} from "./reporters/json-reporter.js";

const BENCH_DIR = path.join(process.cwd(), ".bench-project");
const REPORT_DIR = path.join(process.cwd(), "benchmarks", "reports");

type Scenario =
  | "idle"
  | "burst"
  | "sustained"
  | "startup"
  | "scalability"
  | "stress"
  | "all";

async function ensureProject(fileCount: number): Promise<void> {
  if (await fs.pathExists(BENCH_DIR)) {
    await cleanupProject(BENCH_DIR);
  }
  console.log(`Generating project with ${fileCount} files...`);
  const result = await generateProject({ targetDir: BENCH_DIR, fileCount });
  console.log(
    `  Generated ${result.totalFiles} files (${(
      result.totalSize / 1024
    ).toFixed(1)} KB) in ${result.duration}ms`
  );
}

async function cleanup(): Promise<void> {
  if (await fs.pathExists(BENCH_DIR)) {
    await cleanupProject(BENCH_DIR);
  }
}

function toReportData(
  scenario: string,
  pass: boolean,
  details: string[],
  config: Record<string, unknown>,
  results: Record<string, unknown>
): JsonReportData {
  return {
    scenario,
    date: new Date().toISOString(),
    config,
    results,
    pass,
    details,
  };
}

async function runScenario(
  name: Scenario,
  projectDir: string
): Promise<JsonReportData | null> {
  switch (name) {
    case "idle": {
      console.log("\n[BENCH] Running idle scenario...");
      const result = await runIdle(projectDir, { durationMs: 10_000 });
      for (const d of result.details) console.log(`  ${d}`);
      return toReportData(
        "idle",
        result.pass,
        result.details,
        { durationMs: 10_000 },
        {
          cpuAvg: `${result.summary.cpu.avg}%`,
          cpuPeak: `${result.summary.cpu.max}%`,
          heapPeak: `${result.summary.memory.heapPeakMB} MB`,
          rssPeak: `${result.summary.memory.rssPeakMB} MB`,
        }
      );
    }

    case "burst": {
      console.log("\n[BENCH] Running burst scenario...");
      const result = await runBurst(projectDir, { fileCount: 100 });
      for (const d of result.details) console.log(`  ${d}`);
      return toReportData(
        "burst",
        result.pass,
        result.details,
        { fileCount: 100 },
        {
          throughput: `${result.throughput.toFixed(1)} files/s`,
          cpuPeak: `${result.cpuPeak}%`,
          heapPeak: `${result.heapPeakMB} MB`,
          rssPeak: `${result.rssPeakMB} MB`,
          duration: `${result.duration}ms`,
        }
      );
    }

    case "sustained": {
      console.log("\n[BENCH] Running sustained scenario...");
      const result = await runSustained(projectDir, {
        durationMs: 15_000,
        fileDelayMs: 2_000,
      });
      for (const d of result.details) console.log(`  ${d}`);
      return toReportData(
        "sustained",
        result.pass,
        result.details,
        { durationMs: 15_000, fileDelayMs: 2_000 },
        {
          cpuAvg: `${result.summary.cpu.avg}%`,
          heapPeak: `${result.summary.memory.heapPeakMB} MB`,
          filesModified: result.filesModified,
        }
      );
    }

    case "startup": {
      console.log("\n[BENCH] Running startup scenario...");
      const result = await runStartup(projectDir);
      for (const d of result.details) console.log(`  ${d}`);
      return toReportData(
        "startup",
        result.pass,
        result.details,
        { fileCount: result.fileCount },
        {
          scanDuration: `${result.scanDurationMs}ms`,
          cpuAfterScan: `${result.cpuAfterScan}%`,
        }
      );
    }

    case "scalability": {
      console.log("\n[BENCH] Running scalability scenario...");
      const result = await runScalability(projectDir, { fileCount: 50 });
      for (const d of result.details) console.log(`  ${d}`);
      return toReportData(
        "scalability",
        result.pass,
        result.details,
        { fileCount: 50, chainCounts: [1, 3, 5, 10] },
        {
          speedup: `${result.speedup1vs5.toFixed(2)}x`,
          entries: result.entries.map((e) => ({
            chains: e.chainCount,
            throughput: `${e.throughput.toFixed(1)} files/s`,
            cpuPeak: `${e.cpuPeak}%`,
          })),
        }
      );
    }

    case "stress": {
      console.log("\n[BENCH] Running stress scenario...");
      const result = await runStress(projectDir, { fileCount: 200 });
      for (const d of result.details) console.log(`  ${d}`);
      return toReportData(
        "stress",
        result.pass,
        result.details,
        { fileCount: 200 },
        {
          cpuPeak: `${result.summary.cpu.max}%`,
          heapPeak: `${result.summary.memory.heapPeakMB} MB`,
          rssPeak: `${result.summary.memory.rssPeakMB} MB`,
          recoveryTime: `${result.recoveryTimeMs}ms`,
          cpuAfterRecovery: `${result.cpuAfterRecovery}%`,
        }
      );
    }

    default:
      return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scenario = (args[0] || "all") as Scenario;
  const fileCount = parseInt(args[1] || "200");

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     MINAUTOR WATCHER — BENCHMARK SUITE      ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Scenario: ${scenario}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("");

  try {
    // Generate test project
    await ensureProject(fileCount);

    const scenarios: Scenario[] =
      scenario === "all"
        ? ["idle", "burst", "sustained", "startup", "scalability", "stress"]
        : [scenario];

    const reports: JsonReportData[] = [];

    for (const s of scenarios) {
      const report = await runScenario(s, BENCH_DIR);
      if (report) {
        reports.push(report);
        await saveJsonReport(report, REPORT_DIR);
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));

    const summaryRows = reports.map((r) => ({
      scenario: r.scenario,
      pass: r.pass,
      details: {
        cpuAvg: String(r.results.cpuAvg || r.results.cpuPeak || "—"),
        heapPeak: String(r.results.heapPeak || "—"),
        throughput: String(r.results.throughput || "—"),
      },
    }));

    console.log(formatSummaryTable(summaryRows));

    // Save summary
    const summaryPath = await saveSummaryReport(reports, REPORT_DIR);
    console.log(`\nReports saved to: ${REPORT_DIR}`);
    console.log(`Summary: ${summaryPath}`);

    // Overall verdict
    const allPass = reports.every((r) => r.pass);
    console.log(`\nOverall: ${allPass ? "✓ ALL PASSED" : "✗ SOME FAILED"}`);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
