import {
  generateEnvReport,
  printBanner,
  printCompactBanner,
  getMissingToolsReport,
  getSolutionsReport,
} from "../../src/environment/env-reporter.js";
import { CURRENT_YEAR } from "../../src/environment/types.js";

describe("EnvReporter", () => {
  it("should generate full environment report", async () => {
    const report = await generateEnvReport();

    expect(report).toBeDefined();
    expect(report.system).toBeDefined();
    expect(report.tools).toBeDefined();
    expect(report.devEnv).toBeDefined();
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(report.year).toBe(CURRENT_YEAR);
    expect(Array.isArray(report.missingTools)).toBe(true);
    expect(Array.isArray(report.suggestions)).toBe(true);
  });

  it("should have system info in report", async () => {
    const report = await generateEnvReport();

    expect(report.system.platform).toBeDefined();
    expect(report.system.nodeVersion).toBeDefined();
    expect(report.system.currentYear).toBe(CURRENT_YEAR);
  });

  it("should have tools in report", async () => {
    const report = await generateEnvReport();

    expect(report.tools.length).toBeGreaterThan(0);
    // All tools should have required fields
    for (const tool of report.tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.available).toBe("boolean");
    }
  });

  it("should print banner without errors", async () => {
    const report = await generateEnvReport();

    // Should not throw
    expect(() => printBanner(report)).not.toThrow();
  });

  it("should print compact banner without errors", async () => {
    const report = await generateEnvReport();

    // Should not throw
    expect(() => printCompactBanner(report)).not.toThrow();
  });

  it("should return missing tools report", async () => {
    const report = await generateEnvReport();
    const missingReport = getMissingToolsReport(report);

    expect(typeof missingReport).toBe("string");
    if (report.missingTools.length === 0) {
      expect(missingReport).toContain("All tools are available");
    } else {
      expect(missingReport).toContain("Missing tools");
    }
  });

  it("should return solutions report", async () => {
    const report = await generateEnvReport();
    const solutions = getSolutionsReport(report);

    expect(Array.isArray(solutions)).toBe(true);
    expect(solutions.length).toBe(report.missingTools.length);
  });
});
