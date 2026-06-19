import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  createCpuSampler,
  collectSnapshot,
  summarize,
  MetricSnapshot,
} from "../../benchmarks/collect-metrics.js";
import {
  generateProject,
  cleanupProject,
} from "../../benchmarks/fixtures/generate-project.js";
import {
  formatConsoleReport,
  formatSummaryTable,
} from "../../benchmarks/reporters/console-reporter.js";
import {
  toJsonReport,
} from "../../benchmarks/reporters/json-reporter.js";
import {
  renderBarChart,
  renderSparkline,
  renderTimingChart,
} from "../../benchmarks/reporters/chart-reporter.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-benchmarks");

describe("collect-metrics", () => {
  describe("CpuSampler", () => {
    it("should create a sampler and collect a snapshot", () => {
      const sampler = createCpuSampler();
      sampler.init();
      const snapshot = collectSnapshot(sampler);
      expect(snapshot).toHaveProperty("timestamp");
      expect(snapshot).toHaveProperty("cpu");
      expect(snapshot).toHaveProperty("memory");
      expect(snapshot.cpu.usagePercent).toBeGreaterThanOrEqual(0);
      expect(snapshot.cpu.cores).toBeGreaterThan(0);
      expect(snapshot.memory.heapUsedMB).toBeGreaterThan(0);
      expect(snapshot.memory.rssMB).toBeGreaterThan(0);
    });
  });

  describe("summarize", () => {
    it("should return zeros for empty snapshots", () => {
      const result = summarize([], 1000);
      expect(result.cpu.min).toBe(0);
      expect(result.cpu.max).toBe(0);
      expect(result.cpu.avg).toBe(0);
      expect(result.duration).toBe(1000);
    });

    it("should compute correct stats from snapshots", () => {
      const snapshots: MetricSnapshot[] = [
        {
          timestamp: 1,
          cpu: { usagePercent: 10, cores: 4 },
          memory: { heapUsedMB: 50, heapTotalMB: 100, rssMB: 120, externalMB: 5 },
        },
        {
          timestamp: 2,
          cpu: { usagePercent: 30, cores: 4 },
          memory: { heapUsedMB: 70, heapTotalMB: 100, rssMB: 140, externalMB: 5 },
        },
        {
          timestamp: 3,
          cpu: { usagePercent: 20, cores: 4 },
          memory: { heapUsedMB: 60, heapTotalMB: 100, rssMB: 130, externalMB: 5 },
        },
      ];
      const result = summarize(snapshots, 2000);
      expect(result.cpu.min).toBe(10);
      expect(result.cpu.max).toBe(30);
      expect(result.cpu.avg).toBe(20);
      expect(result.memory.heapPeakMB).toBe(70);
      expect(result.memory.rssPeakMB).toBe(140);
      expect(result.memory.samples).toBe(3);
    });
  });
});

describe("fixtures/generate-project", () => {
  let projectDir: string;

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  it("should generate the correct number of files", async () => {
    projectDir = path.join(TEST_DIR, `gen-${Date.now()}`);
    const result = await generateProject({
      targetDir: projectDir,
      fileCount: 20,
      dirCount: 3,
    });
    expect(result.totalFiles).toBeGreaterThan(20);
    expect(result.totalSize).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(await fs.pathExists(projectDir)).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "package.json"))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, "tsconfig.json"))).toBe(true);
    const entries = await fs.readdir(projectDir);
    expect(entries.length).toBeGreaterThanOrEqual(4);
  }, 30000);

  it("should cleanup a project", async () => {
    const dir = path.join(TEST_DIR, `cleanup-${Date.now()}`);
    await generateProject({ targetDir: dir, fileCount: 5, dirCount: 1 });
    expect(await fs.pathExists(dir)).toBe(true);
    await cleanupProject(dir);
    expect(await fs.pathExists(dir)).toBe(false);
  }, 30000);
});

describe("reporters/console-reporter", () => {
  it("should format a console report", () => {
    const output = formatConsoleReport({
      scenario: "idle",
      date: "2026-06-17",
      config: { duration: 30_000, interval: 1000 },
      results: { cpuAvg: 2.5, heapPeakMB: 45 },
      pass: true,
      details: ["CPU avg: 2.5%"],
    });
    expect(output).toContain("BENCHMARK REPORT");
    expect(output).toContain("idle");
    expect(output).toContain("PASS");
  });

  it("should format a summary table", () => {
    const output = formatSummaryTable([
      { scenario: "idle", pass: true, details: { cpuAvg: "2.5%", heapPeak: "45 MB", throughput: "—" } },
      { scenario: "burst", pass: false, details: { cpuAvg: "55%", heapPeak: "120 MB", throughput: "8.2" } },
    ]);
    expect(output).toContain("idle");
    expect(output).toContain("burst");
    expect(output).toContain("✓");
    expect(output).toContain("✗");
  });
});

describe("reporters/json-reporter", () => {
  it("should produce valid JSON", () => {
    const json = toJsonReport({
      scenario: "burst",
      date: "2026-06-17",
      config: { chainCount: 5 },
      results: { throughput: 45.2 },
      pass: true,
      details: ["All files processed"],
    });
    const parsed = JSON.parse(json);
    expect(parsed.scenario).toBe("burst");
    expect(parsed.pass).toBe(true);
    expect(parsed.results.throughput).toBe(45.2);
  });
});

describe("reporters/chart-reporter", () => {
  describe("renderBarChart", () => {
    it("should render a bar chart", () => {
      const output = renderBarChart({
        labels: ["cpu", "heap"],
        values: [50, 120],
        title: "Metrics",
      });
      expect(output).toContain("cpu");
      expect(output).toContain("heap");
      expect(output).toContain("50");
      expect(output).toContain("120");
    });

    it("should handle empty data", () => {
      expect(renderBarChart({ labels: [], values: [] })).toBe("(empty)");
    });

    it("should handle all-zero values", () => {
      expect(renderBarChart({ labels: ["a"], values: [0] })).toBe("(all zero)");
    });
  });

  describe("renderSparkline", () => {
    it("should render a sparkline", () => {
      const output = renderSparkline([1, 5, 3, 8, 2]);
      expect(output).toContain("min:");
      expect(output).toContain("max:");
    });

    it("should handle empty data", () => {
      expect(renderSparkline([])).toBe("(empty)");
    });
  });

  describe("renderTimingChart", () => {
    it("should render CPU and heap timelines", () => {
      const output = renderTimingChart([1, 2, 3], [50, 60, 70], "My Chart");
      expect(output).toContain("CPU");
      expect(output).toContain("Heap");
      expect(output).toContain("My Chart");
    });
  });
});
