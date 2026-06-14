import { execFile } from "child_process";
import logger from "../shared/logger.js";
import { type ToolInfo, type ToolName } from "./types.js";

/** Cache for tool detection results */
const toolCache = new Map<ToolName, ToolInfo>();

/** Tool definitions with version commands and install suggestions */
const TOOL_DEFINITIONS: Record<
  ToolName,
  { versionCmd: string; versionArgs: string[]; installSuggestion: string }
> = {
  node: {
    versionCmd: "node",
    versionArgs: ["--version"],
    installSuggestion: "Download from https://nodejs.org",
  },
  npm: {
    versionCmd: "npm",
    versionArgs: ["--version"],
    installSuggestion: "Bundled with Node.js — reinstall Node.js",
  },
  npx: {
    versionCmd: "npx",
    versionArgs: ["--version"],
    installSuggestion: "Bundled with npm — reinstall Node.js",
  },
  eslint: {
    versionCmd: "npx",
    versionArgs: ["eslint", "--version"],
    installSuggestion: "npm install -g eslint",
  },
  prettier: {
    versionCmd: "npx",
    versionArgs: ["prettier", "--version"],
    installSuggestion: "npm install -g prettier",
  },
  tsc: {
    versionCmd: "npx",
    versionArgs: ["tsc", "--version"],
    installSuggestion: "npm install -g typescript",
  },
  git: {
    versionCmd: "git",
    versionArgs: ["--version"],
    installSuggestion: "Download from https://git-scm.com",
  },
  yarn: {
    versionCmd: "yarn",
    versionArgs: ["--version"],
    installSuggestion: "npm install -g yarn",
  },
  pnpm: {
    versionCmd: "pnpm",
    versionArgs: ["--version"],
    installSuggestion: "npm install -g pnpm",
  },
  tsx: {
    versionCmd: "npx",
    versionArgs: ["tsx", "--version"],
    installSuggestion: "npm install -g tsx",
  },
};

/**
 * Get the path of an executable on the system
 */
function getToolPath(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFile(cmd, [name], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        const firstLine = stdout.trim().split("\n")[0]?.trim();
        resolve(firstLine || null);
      }
    });
  });
}

/**
 * Get the version of a tool
 */
function getToolVersion(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000 }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Detect a single tool
 */
export async function detectTool(name: ToolName): Promise<ToolInfo> {
  // Return cached result if available
  if (toolCache.has(name)) {
    return toolCache.get(name)!;
  }

  const def = TOOL_DEFINITIONS[name];
  if (!def) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const toolPath = await getToolPath(name);
  const available = toolPath !== null;
  let version: string | null = null;

  if (available) {
    version = await getToolVersion(def.versionCmd, def.versionArgs);
  }

  const info: ToolInfo = {
    name,
    available,
    path: toolPath,
    version,
    installSuggestion: def.installSuggestion,
  };

  toolCache.set(name, info);

  if (available) {
    logger.debug(`Tool detected: ${name} ${version || "?"} at ${toolPath}`);
  } else {
    logger.debug(`Tool not found: ${name}`);
  }

  return info;
}

/**
 * Detect all configured tools
 */
export async function detectTools(): Promise<ToolInfo[]> {
  const toolNames = Object.keys(TOOL_DEFINITIONS) as ToolName[];
  const results = await Promise.all(toolNames.map((name) => detectTool(name)));
  return results;
}

/**
 * Get all missing tools
 */
export async function getMissingTools(): Promise<ToolInfo[]> {
  const tools = await detectTools();
  return tools.filter((t) => !t.available);
}

/**
 * Get install suggestions for missing tools
 */
export async function getInstallSuggestions(): Promise<string[]> {
  const missing = await getMissingTools();
  return missing.map((t) => `${t.name}: ${t.installSuggestion}`);
}

/**
 * Check if a specific tool is available
 */
export async function isToolAvailable(name: ToolName): Promise<boolean> {
  const tool = await detectTool(name);
  return tool.available;
}

/**
 * Clear the tool cache (for testing or re-detection)
 */
export function clearToolCache(): void {
  toolCache.clear();
}
