/**
 * InjectionEngine - Creates/updates consignment files in projects
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  type InjectionResult,
  type InjectionApplyOptions,
  type InjectionConfig,
} from "./types.js";
import { getTemplatesForAgent, getManagedHeader } from "./templates.js";
import { checkInjectionStatus } from "./detector.js";

const DEFAULT_CONFIG: InjectionConfig = {
  enabled: true,
  templates: ["claude", "generic", "copilot", "cursor", "windsurf"],
  autoInject: false,
  autoUpdate: false,
  forceOverwrite: false,
  projectPatterns: ["**/*.ts", "**/*.js", "**/*.json"],
};

/**
 * Create a backup of an existing file
 */
async function createBackup(filePath: string): Promise<string> {
  const backupPath = `${filePath}.bak`;
  try {
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  } catch {
    return "";
  }
}

/**
 * Ensure the directory for a file exists
 */
async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Generate content with version header
 */
function generateContent(templateContent: string, version: string): string {
  return `<!-- ${getManagedHeader()} v${version} -->\n\n${templateContent}`;
}

/**
 * Inject files into a project based on missing/outdated status
 */
export async function injectFiles(
  options: InjectionApplyOptions
): Promise<InjectionResult[]> {
  const { projectDir, agents, config, force, dryRun } = options;
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };

  const status = await checkInjectionStatus({
    projectDir,
    agents,
    config: effectiveConfig,
  });

  const results: InjectionResult[] = [];

  for (const agentStatus of status.agents) {
    const templates = getTemplatesForAgent(agentStatus.agent);

    for (const template of templates) {
      const filePath = path.join(projectDir, template.fileName);

      if (agentStatus.present && !agentStatus.outdated && !force) {
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: "skipped",
          reason: "Already exists and up to date",
        });
        continue;
      }

      if (agentStatus.present && agentStatus.outdated && !force) {
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: "skipped",
          reason: "Outdated but not forced — skipping",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: agentStatus.present ? "updated" : "created",
          reason: "Dry run — no changes made",
        });
        continue;
      }

      try {
        await ensureDir(filePath);

        if (agentStatus.present) {
          await createBackup(filePath);
        }

        const content = generateContent(template.content, template.version);
        await fs.writeFile(filePath, content, "utf-8");

        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: agentStatus.present ? "updated" : "created",
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: "error",
          reason: message,
        });
      }
    }
  }

  return results;
}

/**
 * Format injection results
 */
export function formatInjectionResults(results: InjectionResult[]): string {
  const lines: string[] = ["Injection results:"];

  for (const r of results) {
    const status = r.action === "error" ? `ERROR: ${r.reason}` : r.action;
    lines.push(`  ${r.file} [${r.agent}]: ${status}`);
  }

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const skipped = results.filter((r) => r.action === "skipped").length;
  const errors = results.filter((r) => r.action === "error").length;

  lines.push(
    `\nCreated: ${created}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`
  );
  return lines.join("\n");
}
