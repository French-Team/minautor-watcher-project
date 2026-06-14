/**
 * Environment module types
 * Shared interfaces for environment detection
 */

/** Current year — reusable constant across the codebase */
export const CURRENT_YEAR = new Date().getFullYear();

/** Watcher service version */
export const WATCHER_VERSION = "3.5";

/**
 * GPU information
 */
export interface GPUInfo {
  name: string;
  vramGB: number | null;
}

/**
 * Network interface information
 */
export interface NetworkInterface {
  name: string;
  state: string;
  ip: string | null;
}

/**
 * System information
 */
export interface SystemInfo {
  platform: NodeJS.Platform;
  arch: string;
  osType: string;
  osRelease: string;
  hostname: string;
  username: string;
  totalMemoryGB: number;
  usedMemoryGB: number;
  freeMemoryGB: number;
  memoryUsagePercent: number;
  cpuCount: number;
  cpuModel: string;
  nodeVersion: string;
  npmVersion: string | null;
  gpus: GPUInfo[];
  networkInterfaces: NetworkInterface[];
  currentYear: number;
  currentDate: Date;
  timezone: string;
  systemUptimeHours: number;
}

/**
 * Tool detection result
 */
export interface ToolInfo {
  name: string;
  available: boolean;
  path: string | null;
  version: string | null;
  installSuggestion: string;
}

export type ToolName =
  | "node"
  | "npm"
  | "npx"
  | "eslint"
  | "prettier"
  | "tsc"
  | "git"
  | "yarn"
  | "pnpm"
  | "tsx";

/**
 * Dev environment detection
 */
export interface DevEnvironment {
  ide: {
    name: string | null;
    processName: string | null;
  };
  shell: {
    name: string;
    path: string | null;
  };
  container: {
    isDocker: boolean;
    isWSL: boolean;
    isCI: boolean;
    ciProvider: string | null;
    wslDistro: string | null;
  };
}

/**
 * Full environment report
 */
export interface EnvironmentReport {
  system: SystemInfo;
  tools: ToolInfo[];
  devEnv: DevEnvironment;
  timestamp: Date;
  year: number;
  missingTools: ToolInfo[];
  suggestions: string[];
}
