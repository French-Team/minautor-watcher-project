/**
 * InjectionDetector - Checks which consignment files exist in a project
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  type AgentStatus,
  type InjectionCheckResult,
  type InjectionCheckOptions,
  type InjectionConfig,
} from "./types.js";
import { getTemplatesForAgent, getManagedHeader } from "./templates.js";

const DEFAULT_CONFIG: InjectionConfig = {
  enabled: true,
  templates: ["claude", "generic", "copilot", "cursor", "windsurf"],
  autoInject: false,
  autoUpdate: false,
  forceOverwrite: false,
  projectPatterns: ["**/*.ts", "**/*.js", "**/*.json"],
};

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file's content
 */
async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Extract version from managed content
 */
function extractVersion(content: string): string | undefined {
  const match = content.match(/<!-- Managed by watcher-service v([\d.]+) -->/);
  return match?.[1];
}

/**
 * Check if a file is managed by watcher
 */
function isManagedByWatcher(content: string): boolean {
  return content.includes(getManagedHeader());
}

/**
 * Check the injection status of a project
 */
export async function checkInjectionStatus(
  options: InjectionCheckOptions
): Promise<InjectionCheckResult> {
  const { projectDir, agents, config } = options;
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };

  const targetAgents = agents ?? effectiveConfig.templates;

  const agentStatuses: AgentStatus[] = [];
  let missingCount = 0;
  let outdatedCount = 0;

  for (const agent of targetAgents) {
    const templates = getTemplatesForAgent(agent);

    for (const template of templates) {
      const filePath = path.join(projectDir, template.fileName);
      const exists = await fileExists(filePath);

      let currentVersion: string | undefined;
      let managedByWatcher = false;

      if (exists) {
        const content = await readFileContent(filePath);
        managedByWatcher = isManagedByWatcher(content);
        currentVersion = extractVersion(content);
      }

      const outdated =
        exists &&
        managedByWatcher &&
        currentVersion !== undefined &&
        currentVersion !== template.version;

      const status: AgentStatus = {
        agent,
        fileName: template.fileName,
        present: exists,
        outdated,
        managedByWatcher,
        currentVersion,
        templateVersion: template.version,
        filePath,
      };

      agentStatuses.push(status);

      if (!exists) {
        missingCount++;
      } else if (outdated) {
        outdatedCount++;
      }
    }
  }

  return {
    projectDir,
    agents: agentStatuses,
    missingCount,
    outdatedCount,
  };
}

/**
 * Get a human-readable summary of the injection check
 */
export function formatCheckResult(result: InjectionCheckResult): string {
  const lines: string[] = [`Injection check for: ${result.projectDir}`];

  for (const agent of result.agents) {
    const status = agent.present
      ? agent.outdated
        ? `OUTDATED (v${agent.currentVersion} → v${agent.templateVersion})`
        : `OK${agent.managedByWatcher ? " (managed)" : " (external)"}`
      : "MISSING";
    lines.push(`  ${agent.fileName} [${agent.agent}]: ${status}`);
  }

  lines.push(
    `\nMissing: ${result.missingCount}, Outdated: ${result.outdatedCount}`
  );
  return lines.join("\n");
}
