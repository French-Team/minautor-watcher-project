/**
 * InjectionEngine - Creates/updates consignment files in projects
 * Uses marker-based merge to preserve existing content.
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

const WATCHER_SECTION_START = "<!-- watcher-service:start -->";
const WATCHER_SECTION_END = "<!-- watcher-service:end -->";

/**
 * Ensure the directory for a file exists
 */
async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Build the managed section (markers + version header + template content).
 */
function buildManagedSection(templateContent: string, version: string): string {
  const header = `  <!-- ${getManagedHeader()} v${version} -->`;
  return [
    WATCHER_SECTION_START,
    header,
    "",
    ...templateContent.split("\n").map((l) => (l ? `  ${l}` : "")),
    "",
    WATCHER_SECTION_END,
  ].join("\n");
}

/**
 * Merge new watcher content into existing file content.
 *
 * - File empty / doesn't exist  -> returns full content with markers
 * - File has markers            -> replaces content BETWEEN markers only
 * - File has no markers         -> appends markers + content at end
 */
function mergeWithExistingContent(
  existing: string,
  templateContent: string,
  version: string
): string {
  const section = buildManagedSection(templateContent, version);

  if (!existing.trim()) {
    return section + "\n";
  }

  const startIdx = existing.indexOf(WATCHER_SECTION_START);
  const endIdx = existing.indexOf(WATCHER_SECTION_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace content between markers
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + WATCHER_SECTION_END.length);
    return before + section + after;
  }

  // No markers found -> append at end
  const trimmed = existing.trimEnd();
  return trimmed + "\n\n" + section + "\n";
}

/**
 * Inject files into a project based on missing/outdated status.
 * Uses marker merge: existing content is NEVER deleted.
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
    const seenFiles = new Set<string>();

    for (const template of templates) {
      const filePath = path.join(projectDir, template.fileName);

      if (seenFiles.has(template.fileName)) {
        continue;
      }
      seenFiles.add(template.fileName);

      // Skip up-to-date managed files unless force
      if (agentStatus.present && !agentStatus.outdated && !force) {
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: "skipped",
          reason: "Deja present et a jour",
        });
        continue;
      }

      // Skip outdated managed files unless force
      if (agentStatus.present && agentStatus.outdated && !force) {
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: "skipped",
          reason: "Version obsolete mais force non active",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          file: template.fileName,
          agent: agentStatus.agent,
          action: agentStatus.present ? "updated" : "created",
          reason: "Dry run — aucun changement",
        });
        continue;
      }

      try {
        await ensureDir(filePath);

        // Read existing content (empty string if file doesn't exist)
        let existing = "";
        try {
          existing = await fs.readFile(filePath, "utf-8");
        } catch {
          // file doesn't exist yet
        }

        const merged = mergeWithExistingContent(
          existing,
          template.content,
          template.version
        );

        await fs.writeFile(filePath, merged, "utf-8");

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
