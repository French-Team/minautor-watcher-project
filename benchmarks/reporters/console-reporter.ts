export interface ConsoleReportData {
  scenario: string;
  date: string;
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  pass: boolean;
  details: string[];
}

/**
 * Format a benchmark result for console display
 */
export function formatConsoleReport(data: ConsoleReportData): string {
  const lines: string[] = [];
  const w = 50;

  lines.push("╔" + "═".repeat(w) + "╗");
  lines.push("║" + center(`BENCHMARK REPORT — ${data.date}`, w) + "║");
  lines.push("╠" + "═".repeat(w) + "╣");
  lines.push("║" + center(`Scenario: ${data.scenario}`, w) + "║");

  // Config
  for (const [key, value] of Object.entries(data.config)) {
    lines.push("║" + pad(`  ${key}: ${formatValue(value)}`, w) + "║");
  }

  lines.push("╠" + "═".repeat(w) + "╣");

  // Results
  for (const [key, value] of Object.entries(data.results)) {
    if (typeof value === "object" && value !== null) {
      for (const [subKey, subValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        lines.push("║" + pad(`  ${subKey}: ${formatValue(subValue)}`, w) + "║");
      }
    } else {
      lines.push("║" + pad(`  ${key}: ${formatValue(value)}`, w) + "║");
    }
  }

  lines.push("╠" + "═".repeat(w) + "╣");

  // Verdict
  const verdict = data.pass ? "✓ PASS" : "✗ FAIL";
  lines.push("║" + center(verdict, w) + "║");

  lines.push("╚" + "═".repeat(w) + "╝");

  return lines.join("\n");
}

/**
 * Format a summary table for multiple scenarios
 */
export function formatSummaryTable(
  results: Array<{
    scenario: string;
    pass: boolean;
    details: Record<string, string>;
  }>
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(
    "┌─────────────────────┬──────┬────────────┬────────────┬────────────┐"
  );
  lines.push(
    "│ Scenario            │ Pass │ CPU avg    │ Heap peak  │ Throughput │"
  );
  lines.push(
    "├─────────────────────┼──────┼────────────┼────────────┼────────────┤"
  );

  for (const r of results) {
    const pass = r.pass ? " ✓ " : " ✗ ";
    const cpu = r.details.cpuAvg || "—";
    const heap = r.details.heapPeak || "—";
    const throughput = r.details.throughput || "—";
    lines.push(
      `│ ${padStr(r.scenario, 19)} │  ${pass} │ ${padStr(cpu, 10)} │ ${padStr(
        heap,
        10
      )} │ ${padStr(throughput, 10)} │`
    );
  }

  lines.push(
    "└─────────────────────┴──────┴────────────┴────────────┴────────────┘"
  );

  return lines.join("\n");
}

function center(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

function pad(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  return text + " ".repeat(padding);
}

function padStr(text: string, width: number): string {
  if (text.length > width) return text.slice(0, width - 1) + "…";
  return text + " ".repeat(width - text.length);
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return value % 1 === 0 ? String(value) : value.toFixed(1);
  }
  return String(value);
}
