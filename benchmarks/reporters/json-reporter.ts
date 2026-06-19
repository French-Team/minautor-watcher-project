import fs from "fs-extra";
import path from "path";

export interface JsonReportData {
  scenario: string;
  date: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  pass: boolean;
  details: string[];
}

/**
 * Convert benchmark data to JSON format
 */
export function toJsonReport(data: JsonReportData): string {
  return JSON.stringify(
    {
      scenario: data.scenario,
      date: data.date,
      config: data.config,
      results: data.results,
      pass: data.pass,
      details: data.details,
    },
    null,
    2
  );
}

/**
 * Save benchmark report to a JSON file
 */
export async function saveJsonReport(
  data: JsonReportData,
  outputDir: string
): Promise<string> {
  await fs.ensureDir(outputDir);

  const filename = `bench-${data.scenario}-${Date.now()}.json`;
  const filePath = path.join(outputDir, filename);

  await fs.writeFile(filePath, toJsonReport(data), "utf-8");
  return filePath;
}

/**
 * Save all results as a summary file
 */
export async function saveSummaryReport(
  results: Array<JsonReportData>,
  outputDir: string
): Promise<string> {
  await fs.ensureDir(outputDir);

  const filename = `bench-summary-${Date.now()}.json`;
  const filePath = path.join(outputDir, filename);

  const summary = {
    date: new Date().toISOString(),
    totalScenarios: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    scenarios: results.map((r) => ({
      scenario: r.scenario,
      pass: r.pass,
      config: r.config,
      results: r.results,
    })),
  };

  await fs.writeFile(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return filePath;
}
