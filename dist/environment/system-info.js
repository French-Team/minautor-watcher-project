import os from "os";
import { execFile, execFileSync } from "child_process";
import { CURRENT_YEAR, } from "./types.js";
/**
 * Get npm version by running `npm --version`
 */
function getNpmVersion() {
    return new Promise((resolve) => {
        execFile("npm", ["--version"], { timeout: 5000 }, (error, stdout) => {
            if (error) {
                resolve(null);
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}
/**
 * Read GPU VRAM from Windows registry (QWORD, accurate for >4GB)
 * Falls back to wmic AdapterRAM (DWORD, caps at ~4GB)
 */
function readGPUVramFromRegistry() {
    if (os.platform() !== "win32")
        return null;
    try {
        const out = execFileSync("powershell", [
            "-NoProfile",
            "-Command",
            "Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000' " +
                "-Name 'HardwareInformation.qwMemorySize' -ErrorAction SilentlyContinue | " +
                "Select-Object -ExpandProperty 'HardwareInformation.qwMemorySize'",
        ], { timeout: 10000, stdio: "pipe" })
            .toString()
            .trim();
        const val = parseInt(out, 10);
        return val > 0 ? val : null;
    }
    catch {
        return null;
    }
}
/**
 * Detect GPUs (Windows only via wmic + registry)
 */
function getGPUs() {
    if (os.platform() !== "win32")
        return [];
    try {
        const out = execFileSync("wmic", [
            "path",
            "win32_VideoController",
            "get",
            "name,AdapterRAM",
            "/format:list",
        ], { timeout: 10000, stdio: "pipe" }).toString();
        const registryVram = readGPUVramFromRegistry();
        const gpus = [];
        const blocks = out.split(/\r?\n\r?\n/);
        for (const block of blocks) {
            const nameMatch = block.match(/Name=(.+)/);
            if (nameMatch) {
                const name = nameMatch[1].trim();
                // Use registry QWORD if available (accurate for >4GB)
                let vramGB = null;
                if (registryVram && registryVram > 0) {
                    vramGB = Math.round((registryVram / 1073741824) * 10) / 10;
                }
                else {
                    // Fallback to DWORD AdapterRAM
                    const ramMatch = block.match(/AdapterRAM=(\d+)/);
                    const ramBytes = ramMatch ? parseInt(ramMatch[1], 10) : 0;
                    if (ramBytes > 0) {
                        vramGB = Math.round((ramBytes / 1073741824) * 10) / 10;
                    }
                }
                gpus.push({ name, vramGB });
            }
        }
        return gpus;
    }
    catch {
        return [];
    }
}
/**
 * Detect network interfaces (Windows only via netsh + ipconfig)
 */
function getNetworkInterfaces() {
    if (os.platform() !== "win32")
        return [];
    try {
        const out = execFileSync("netsh", ["interface", "show", "interface"], {
            timeout: 10000,
            stdio: "pipe",
        }).toString();
        const lines = out.split(/\r?\n/).filter((l) => /connect/i.test(l));
        const interfaces = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s{2,}/);
            if (parts.length >= 3) {
                interfaces.push({
                    name: parts[parts.length - 1],
                    state: parts.length >= 4 ? parts[1] : parts[0],
                    ip: null,
                });
            }
        }
        // Get IPs from ipconfig
        const ipOut = execFileSync("ipconfig", [], {
            timeout: 10000,
            stdio: "pipe",
        }).toString();
        for (const iface of interfaces) {
            const idx = ipOut.indexOf(iface.name);
            if (idx < 0)
                continue;
            const block = ipOut.substring(idx);
            const ipv4Idx = block.indexOf("IPv4");
            if (ipv4Idx < 0)
                continue;
            const after = block.substring(ipv4Idx);
            const ipMatch = after.match(/:\s*([\d.]+)/);
            if (ipMatch) {
                iface.ip = ipMatch[1];
            }
        }
        return interfaces;
    }
    catch {
        return [];
    }
}
/**
 * Collect system information at startup
 */
export async function getSystemInfo() {
    const cpus = os.cpus();
    const npmVersion = await getNpmVersion();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return {
        platform: os.platform(),
        arch: os.arch(),
        osType: os.type(),
        osRelease: os.release(),
        hostname: os.hostname(),
        username: os.userInfo().username,
        totalMemoryGB: Math.round((totalMem / 1073741824) * 10) / 10,
        usedMemoryGB: Math.round((usedMem / 1073741824) * 10) / 10,
        freeMemoryGB: Math.round((freeMem / 1073741824) * 10) / 10,
        memoryUsagePercent: Math.round((usedMem / totalMem) * 100),
        cpuCount: cpus.length,
        cpuModel: cpus[0]?.model || "unknown",
        nodeVersion: process.version,
        npmVersion,
        gpus: getGPUs(),
        networkInterfaces: getNetworkInterfaces(),
        currentYear: CURRENT_YEAR,
        currentDate: new Date(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        systemUptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
    };
}
/**
 * Format system info as a readable string
 */
export function formatSystemInfo(info) {
    const lines = [
        `Platform    : ${info.platform} ${info.arch}`,
        `OS          : ${info.osType} ${info.osRelease}`,
        `Host        : ${info.hostname} (${info.username})`,
        `Node.js     : ${info.nodeVersion}`,
        `npm         : ${info.npmVersion || "not found"}`,
        `CPU         : ${info.cpuCount} cores — ${info.cpuModel}`,
        `RAM         : ${info.usedMemoryGB} / ${info.totalMemoryGB} GB (${info.memoryUsagePercent}%)`,
    ];
    if (info.gpus.length > 0) {
        for (const gpu of info.gpus) {
            const vram = gpu.vramGB ? `${gpu.vramGB} GB VRAM` : "VRAM unknown";
            lines.push(`GPU         : ${gpu.name} (${vram})`);
        }
    }
    const connected = info.networkInterfaces.filter((n) => /connect/i.test(n.state));
    for (const iface of connected) {
        const ip = iface.ip ? ` (${iface.ip})` : "";
        lines.push(`Network     : ${iface.name}${ip}`);
    }
    lines.push(`Timezone    : ${info.timezone}`);
    lines.push(`Year        : ${info.currentYear}`);
    lines.push(`Uptime      : ${info.systemUptimeHours}h`);
    return lines.join("\n");
}
//# sourceMappingURL=system-info.js.map