import {
  type EnvironmentReport,
  CURRENT_YEAR,
  WATCHER_VERSION,
} from "./types.js";
import { getSystemInfo } from "./system-info.js";
import { detectTools } from "./tool-detector.js";
import { detectDevEnvironment } from "./dev-environment.js";

/**
 * Generate the full environment report
 */
export async function generateEnvReport(): Promise<EnvironmentReport> {
  const [system, tools, devEnv] = await Promise.all([
    getSystemInfo(),
    detectTools(),
    detectDevEnvironment(),
  ]);

  const missingTools = tools.filter((t) => !t.available);
  const suggestions = missingTools.map((t) => t.installSuggestion);

  return {
    system,
    tools,
    devEnv,
    timestamp: new Date(),
    year: CURRENT_YEAR,
    missingTools,
    suggestions,
  };
}

/**
 * Truncate a path for display (show first and last part)
 */
function truncatePath(p: string | null, maxLen = 35): string {
  if (!p) return "—";
  if (p.length <= maxLen) return p;
  const start = p.substring(0, 12);
  const end = p.substring(p.length - (maxLen - 15));
  return `${start}...${end}`;
}

/**
 * Print the environment banner to console
 */
export function printBanner(report: EnvironmentReport): void {
  const { system, tools, devEnv, missingTools } = report;
  const availableCount = tools.filter((t) => t.available).length;
  const totalCount = tools.length;

  const line = "═".repeat(56);

  console.log("");
  console.log(`╔${line}╗`);
  console.log(
    `║  WATCHER SERVICE v${WATCHER_VERSION} — ${CURRENT_YEAR}`.padEnd(59) + "║"
  );
  console.log(`║  Environment Report`.padEnd(59) + "║");
  console.log(`╠${line}╣`);

  // System section
  const dateStr = system.currentDate
    .toISOString()
    .replace("T", " ")
    .substring(0, 16);
  console.log(
    `║  Date       : ${dateStr} (${system.timezone})`.padEnd(59) + "║"
  );
  console.log(
    `║  OS         : ${system.platform} ${system.arch} (${system.osRelease})`.padEnd(
      59
    ) + "║"
  );
  console.log(
    `║  Host       : ${system.hostname} (${system.username})`.padEnd(59) + "║"
  );
  console.log(`║  Node.js    : ${system.nodeVersion}`.padEnd(59) + "║");
  if (system.npmVersion) {
    console.log(`║  npm        : ${system.npmVersion}`.padEnd(59) + "║");
  }
  console.log(
    `║  CPU        : ${system.cpuCount} cores — ${system.cpuModel}`.padEnd(59) +
      "║"
  );
  console.log(`║  RAM        : ${system.totalMemoryGB} GB`.padEnd(59) + "║");

  // Tools section
  console.log(`╠${line}╣`);
  console.log(
    `║  Tools (${availableCount}/${totalCount} available)`.padEnd(59) + "║"
  );

  for (const tool of tools) {
    const icon = tool.available ? "✓" : "✗";
    const version = tool.version || "—";
    const toolPath = truncatePath(tool.path);
    const line = `║  ${icon} ${tool.name.padEnd(12)} ${version.padEnd(
      10
    )} ${toolPath}`;
    console.log(line.padEnd(59) + "║");
  }

  // Missing tools suggestions
  if (missingTools.length > 0) {
    console.log(`╠${line}╣`);
    console.log(`║  Missing Tools — Solutions`.padEnd(59) + "║");
    for (const tool of missingTools) {
      const line = `║    ${tool.name}: ${tool.installSuggestion}`;
      console.log(line.padEnd(59) + "║");
    }
  }

  // Dev Environment section
  console.log(`╠${line}╣`);
  console.log(`║  Dev Environment`.padEnd(59) + "║");
  console.log(
    `║  IDE        : ${devEnv.ide.name || "not detected"}`.padEnd(59) + "║"
  );
  console.log(`║  Shell      : ${devEnv.shell.name}`.padEnd(59) + "║");
  console.log(
    `║  Docker     : ${devEnv.container.isDocker ? "Yes" : "No"}`.padEnd(59) +
      "║"
  );
  console.log(
    `║  WSL        : ${
      devEnv.container.isWSL ? `Yes (${devEnv.container.wslDistro})` : "No"
    }`.padEnd(59) + "║"
  );
  console.log(
    `║  CI         : ${
      devEnv.container.isCI ? `Yes (${devEnv.container.ciProvider})` : "No"
    }`.padEnd(59) + "║"
  );

  console.log(`╚${line}╝`);
  console.log("");
}

/**
 * Print compact banner (for start-watcher.bat)
 */
export function printCompactBanner(report: EnvironmentReport): void {
  const { system, missingTools } = report;
  const availableCount = report.tools.filter((t) => t.available).length;
  const totalCount = report.tools.length;

  const dateStr = system.currentDate
    .toISOString()
    .replace("T", " ")
    .substring(0, 16);

  console.log("");
  console.log(`  WATCHER SERVICE v${WATCHER_VERSION} — ${CURRENT_YEAR}`);
  console.log(
    `  ${dateStr} | ${system.platform} ${system.arch} | Node ${system.nodeVersion}`
  );
  console.log(`  Tools: ${availableCount}/${totalCount} available`);

  if (missingTools.length > 0) {
    console.log(`  Missing: ${missingTools.map((t) => t.name).join(", ")}`);
  }
  console.log("");
}

/**
 * Get missing tools report as string
 */
export function getMissingToolsReport(report: EnvironmentReport): string {
  if (report.missingTools.length === 0) {
    return "All tools are available.";
  }

  const lines = report.missingTools.map(
    (t) => `  ✗ ${t.name}: ${t.installSuggestion}`
  );
  return `Missing tools:\n${lines.join("\n")}`;
}

/**
 * Get solutions report as string array
 */
export function getSolutionsReport(report: EnvironmentReport): string[] {
  return report.suggestions;
}
