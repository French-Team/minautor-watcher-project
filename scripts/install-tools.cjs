#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Dynamic Tool Installer for Watcher Service
 * Uses ToolDetector to find missing tools and install them
 * Run with: node scripts/install-tools.cjs
 */
const { execFileSync } = require("child_process");
const os = require("os");

const isWindows = os.platform() === "win32";

// Tool definitions
const TOOLS = [
  {
    name: "node",
    critical: true,
    versionCmd: "node",
    versionArgs: ["--version"],
    install: null, // manual
    installUrl: "https://nodejs.org",
    installWinget: "OpenJS.NodeJS.LTS",
  },
  {
    name: "npm",
    critical: true,
    versionCmd: "npm",
    versionArgs: ["--version"],
    install: null, // bundled with node
    installUrl: "https://nodejs.org",
  },
  {
    name: "npx",
    critical: true,
    versionCmd: "npx",
    versionArgs: ["--version"],
    install: null, // bundled with npm
    installUrl: "https://nodejs.org",
  },
  {
    name: "eslint",
    critical: false,
    versionCmd: "npx",
    versionArgs: ["eslint", "--version"],
    install: { cmd: "npm", args: ["install", "-g", "eslint"] },
  },
  {
    name: "prettier",
    critical: false,
    versionCmd: "npx",
    versionArgs: ["prettier", "--version"],
    install: { cmd: "npm", args: ["install", "-g", "prettier"] },
  },
  {
    name: "tsc",
    critical: false,
    versionCmd: "npx",
    versionArgs: ["tsc", "--version"],
    install: { cmd: "npm", args: ["install", "-g", "typescript"] },
  },
  {
    name: "git",
    critical: false,
    versionCmd: "git",
    versionArgs: ["--version"],
    install: null,
    installUrl: "https://git-scm.com",
    installWinget: "Git.Git",
  },
  {
    name: "yarn",
    critical: false,
    versionCmd: "yarn",
    versionArgs: ["--version"],
    install: { cmd: "npm", args: ["install", "-g", "yarn"] },
  },
  {
    name: "pnpm",
    critical: false,
    versionCmd: "pnpm",
    versionArgs: ["--version"],
    install: { cmd: "npm", args: ["install", "-g", "pnpm"] },
  },
  {
    name: "tsx",
    critical: false,
    versionCmd: "npx",
    versionArgs: ["tsx", "--version"],
    install: { cmd: "npm", args: ["install", "-g", "tsx"] },
  },
];

function checkAvailable(name) {
  try {
    const cmd = isWindows ? "where" : "which";
    execFileSync(cmd, [name], { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { timeout: 10000, stdio: "pipe" });
    return out.toString().trim();
  } catch {
    return null;
  }
}

function installTool(tool) {
  if (!tool.install) return false;

  console.log(`  [*] Installing ${tool.name}...`);
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync(tool.install.cmd, tool.install.args, {
      timeout: 120000,
      shell: true,
      stdio: "pipe",
    });
    if (result.status === 0) {
      console.log(`  [OK] ${tool.name} installed`);
      return true;
    } else {
      const stderr = result.stderr ? result.stderr.toString() : "";
      console.log(`  [FAIL] ${tool.name}: ${stderr.substring(0, 100)}`);
      return false;
    }
  } catch (e) {
    console.log(`  [FAIL] ${tool.name}: ${e.message}`);
    return false;
  }
}

// --- Main ---
console.log("");
console.log("  WATCHER SERVICE - Dynamic Tool Installer");
console.log("  =========================================");
console.log("");

const results = [];

for (const tool of TOOLS) {
  process.stdout.write(`  ${tool.name.padEnd(12)}`);

  const available = checkAvailable(tool.name);
  if (available) {
    const ver = getVersion(tool.versionCmd, tool.versionArgs);
    console.log(`[OK] ${ver || "?"}`);
    results.push({ name: tool.name, status: "ok", version: ver });
    continue;
  }

  // Try auto-install
  if (tool.install) {
    console.log("[MISSING] -> installing...");
    const ok = installTool(tool);
    if (ok) {
      const ver = getVersion(tool.versionCmd, tool.versionArgs);
      results.push({ name: tool.name, status: "installed", version: ver });
    } else {
      results.push({ name: tool.name, status: "failed" });
    }
  } else {
    // Manual install required
    const hint = tool.installWinget
      ? `winget install ${tool.installWinget}`
      : tool.installUrl
      ? `Download: ${tool.installUrl}`
      : "Manual install required";
    console.log(`[MISSING] -> ${hint}`);
    results.push({ name: tool.name, status: "manual", hint });
  }
}

// Summary
console.log("");
console.log("  =========================================");
const okCount = results.filter((r) => r.status === "ok").length;
const installedCount = results.filter((r) => r.status === "installed").length;
const failedCount = results.filter((r) => r.status === "failed").length;
const manualCount = results.filter((r) => r.status === "manual").length;

console.log(
  `  OK: ${okCount} | Installed: ${installedCount} | Failed: ${failedCount} | Manual: ${manualCount}`
);

if (failedCount > 0 || manualCount > 0) {
  console.log("");
  console.log("  Tools requiring manual action:");
  for (const r of results) {
    if (r.status === "failed" || r.status === "manual") {
      console.log(`    - ${r.name}: ${r.hint || "Install manually"}`);
    }
  }
}

console.log("");
