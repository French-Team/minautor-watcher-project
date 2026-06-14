#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Compact environment banner for start-watcher.bat
 * Run with: node scripts/env-banner.cjs
 */
const os = require("os");
const { execFileSync } = require("child_process");

const platform = os.platform();
const arch = os.arch();
const nodeVer = process.version;
const hostname = os.hostname();
const username = os.userInfo().username;
const totalMemGB = Math.round((os.totalmem() / 1073741824) * 10) / 10;
const usedMemGB =
  Math.round(((os.totalmem() - os.freemem()) / 1073741824) * 10) / 10;
const cpus = os.cpus().length;
const cpuModel = os.cpus()[0]?.model || "unknown";
const now = new Date();
const dateStr = now.toISOString().replace("T", " ").substring(0, 16);
const year = now.getFullYear();

// --- GPU detection ---
// Registry path for GPU VRAM: HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000
// AdapterRAM (DWORD) caps at ~4GB; qwMemorySize (QWORD) has the real value.
function readGPUVramFromRegistry() {
  if (platform !== "win32") return null;
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000' " +
          "-Name 'HardwareInformation.qwMemorySize' -ErrorAction SilentlyContinue | " +
          "Select-Object -ExpandProperty 'HardwareInformation.qwMemorySize'",
      ],
      { timeout: 10000, stdio: "pipe" }
    )
      .toString()
      .trim();
    const val = parseInt(out, 10);
    return val > 0 ? val : null;
  } catch {
    return null;
  }
}

function getGPU() {
  if (platform !== "win32") return null;
  try {
    const out = execFileSync(
      "wmic",
      [
        "path",
        "win32_VideoController",
        "get",
        "name,AdapterRAM",
        "/format:list",
      ],
      {
        timeout: 10000,
        stdio: "pipe",
      }
    ).toString();

    const registryVram = readGPUVramFromRegistry();

    const gpus = [];
    const blocks = out.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const nameMatch = block.match(/Name=(.+)/);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        // Use registry QWORD if available, else fall back to DWORD AdapterRAM
        const vramBytes = registryVram || 0;
        let vramGB = null;
        if (vramBytes > 0) {
          vramGB = Math.round((vramBytes / 1073741824) * 10) / 10;
        } else {
          const ramMatch = block.match(/AdapterRAM=(\d+)/);
          const ramBytes = ramMatch ? parseInt(ramMatch[1], 10) : 0;
          if (ramBytes > 4294967295) {
            vramGB = Math.round((ramBytes / 1073741824) * 10) / 10;
          } else if (ramBytes > 0) {
            vramGB = Math.round((ramBytes / 1073741824) * 10) / 10;
          }
        }
        gpus.push({ name, vramGB });
      }
    }
    return gpus.length > 0 ? gpus : null;
  } catch {
    return null;
  }
}

// --- Network detection ---
function getNetwork() {
  if (platform !== "win32") return null;
  try {
    const out = execFileSync("netsh", ["interface", "show", "interface"], {
      timeout: 10000,
      stdio: "pipe",
    }).toString();

    // Match lines with "Connect" (handles both "Connected" and "Connect\u00e9")
    const lines = out.split(/\r?\n/).filter((l) => /connect/i.test(l));
    const interfaces = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 3) {
        // parts[0] = Admin state, parts[1] = Connection state, last = name
        interfaces.push({
          name: parts[parts.length - 1],
          state: parts.length >= 4 ? parts[1] : parts[0],
        });
      }
    }

    // Get IP for connected interfaces
    const ipOut = execFileSync("ipconfig", [], {
      timeout: 10000,
      stdio: "pipe",
    }).toString();

    for (const iface of interfaces) {
      // Find IPv4 block in ipconfig output
      const idx = ipOut.indexOf(iface.name);
      if (idx < 0) continue;
      const block = ipOut.substring(idx);
      const ipv4Idx = block.indexOf("IPv4");
      if (ipv4Idx < 0) continue;
      const after = block.substring(ipv4Idx);
      const ipMatch = after.match(/:\s*([\d.]+)/);
      if (ipMatch) {
        iface.ip = ipMatch[1];
      }
    }

    return interfaces.length > 0 ? interfaces : null;
  } catch {
    return null;
  }
}

// --- Tool detection ---
function checkTool(name) {
  try {
    const cmd = platform === "win32" ? "where" : "which";
    execFileSync(cmd, [name], { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getVersion(name, args) {
  try {
    const out = execFileSync(name, args, { timeout: 10000, stdio: "pipe" });
    return out.toString().trim();
  } catch {
    return null;
  }
}

const tools = [
  { name: "node", ok: true, ver: nodeVer },
  { name: "npm", ok: checkTool("npm"), ver: null },
  { name: "npx", ok: checkTool("npx"), ver: null },
  { name: "eslint", ok: checkTool("npx"), ver: null },
  { name: "prettier", ok: checkTool("npx"), ver: null },
  { name: "tsc", ok: checkTool("npx"), ver: null },
  { name: "git", ok: checkTool("git"), ver: null },
];

for (const t of tools) {
  if (t.name === "node") continue;
  if (!t.ok) continue;
  if (t.name === "npm" || t.name === "npx")
    t.ver = getVersion("npm", ["--version"]);
  else if (t.name === "eslint")
    t.ver = getVersion("npx", ["eslint", "--version"]);
  else if (t.name === "prettier")
    t.ver = getVersion("npx", ["prettier", "--version"]);
  else if (t.name === "tsc") t.ver = getVersion("npx", ["tsc", "--version"]);
  else if (t.name === "git") {
    const out = getVersion("git", ["--version"]);
    t.ver = out ? out.replace("git version ", "") : null;
  }
}

const avail = tools.filter((t) => t.ok).length;
const total = tools.length;
const missing = tools.filter((t) => !t.ok).map((t) => t.name);

// Collect all info
const gpus = getGPU();
const netifs = getNetwork();

// --- Print banner ---
console.log("");
console.log("  WATCHER SERVICE v3.5 \u2014 " + year);
console.log(
  "  " + dateStr + " | " + platform + " " + arch + " | Node " + nodeVer
);
console.log("  Host: " + hostname + " (" + username + ")");

// CPU
const shortModel = cpuModel.replace(/\s+/g, " ").substring(0, 40);
console.log("  CPU: " + cpus + " cores \u2014 " + shortModel);

// RAM
console.log(
  "  RAM: " +
    usedMemGB +
    " / " +
    totalMemGB +
    " GB used (" +
    Math.round((usedMemGB / totalMemGB) * 100) +
    "%)"
);

// GPU
if (gpus && gpus.length > 0) {
  for (const gpu of gpus) {
    const vram = gpu.vramGB ? gpu.vramGB + " GB VRAM" : "VRAM unknown";
    console.log("  GPU: " + gpu.name.substring(0, 50) + " (" + vram + ")");
  }
} else {
  console.log("  GPU: not detected");
}

// Network
if (netifs) {
  const connected = netifs.filter((n) => /connect/i.test(n.state));
  for (const iface of connected.slice(0, 2)) {
    const ip = iface.ip ? " (" + iface.ip + ")" : "";
    console.log("  Net: " + iface.name.substring(0, 30) + ip);
  }
  if (connected.length === 0) {
    console.log("  Net: no connected interface");
  }
} else {
  console.log("  Net: not detected");
}

// Tools
console.log(
  "  Tools: " +
    avail +
    "/" +
    total +
    " available" +
    (missing.length ? " | Missing: " + missing.join(", ") : "")
);
console.log("");
