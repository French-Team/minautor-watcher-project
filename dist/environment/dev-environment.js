import fs from "fs";
/**
 * Detect IDE / Editor
 */
function detectIDE() {
    // VS Code
    if (process.env.VSCODE_IPC_HOOK || process.env.VSCODE_PID) {
        return { name: "VS Code", processName: "code" };
    }
    // JetBrains (IntelliJ, WebStorm, PyCharm)
    if (process.env.TERM_PROGRAM === "jetbrains" || process.env.JETBRAINS) {
        return { name: "JetBrains", processName: "jetbrains" };
    }
    // Sublime Text
    if (process.env.SUBLIME_TEXT) {
        return { name: "Sublime Text", processName: "sublime" };
    }
    // Vim / Neovim
    if (process.env.NVIM) {
        return { name: "Neovim", processName: "nvim" };
    }
    if (process.env.VIM) {
        return { name: "Vim", processName: "vim" };
    }
    return { name: null, processName: null };
}
/**
 * Detect current shell
 */
function detectShell() {
    const comSpec = process.env.ComSpec || "";
    const shellEnv = process.env.SHELL || "";
    // PowerShell
    if (comSpec.toLowerCase().includes("powershell") ||
        process.env.PSModulePath) {
        return { name: "powershell", path: comSpec || null };
    }
    // Bash
    if (shellEnv.includes("bash")) {
        return { name: "bash", path: shellEnv };
    }
    // Zsh
    if (shellEnv.includes("zsh")) {
        return { name: "zsh", path: shellEnv };
    }
    // Fish
    if (shellEnv.includes("fish")) {
        return { name: "fish", path: shellEnv };
    }
    // Windows CMD (default on Windows)
    if (process.platform === "win32") {
        return { name: "cmd", path: comSpec || null };
    }
    // Default
    return { name: "unknown", path: shellEnv || null };
}
/**
 * Detect Docker environment
 */
function detectDocker() {
    // Check /.dockerenv
    try {
        if (fs.existsSync("/.dockerenv")) {
            return true;
        }
    }
    catch {
        // Ignore errors
    }
    // Check /proc/1/cgroup
    try {
        const cgroup = fs.readFileSync("/proc/1/cgroup", "utf-8");
        if (cgroup.includes("docker")) {
            return true;
        }
    }
    catch {
        // Ignore errors (not on Linux)
    }
    return false;
}
/**
 * Detect WSL environment
 */
function detectWSL() {
    const distro = process.env.WSL_DISTRO_NAME || null;
    return {
        isWSL: !!distro,
        distro,
    };
}
/**
 * Detect CI environment
 */
function detectCI() {
    if (process.env.GITHUB_ACTIONS === "true") {
        return { isCI: true, provider: "GitHub Actions" };
    }
    if (process.env.GITLAB_CI === "true") {
        return { isCI: true, provider: "GitLab CI" };
    }
    if (process.env.JENKINS_URL) {
        return { isCI: true, provider: "Jenkins" };
    }
    if (process.env.CIRCLECI === "true") {
        return { isCI: true, provider: "CircleCI" };
    }
    if (process.env.TRAVIS === "true") {
        return { isCI: true, provider: "Travis CI" };
    }
    if (process.env.CI === "true") {
        return { isCI: true, provider: "unknown CI" };
    }
    return { isCI: false, provider: null };
}
/**
 * Detect full development environment
 */
export async function detectDevEnvironment() {
    const ide = detectIDE();
    const shell = detectShell();
    const isDocker = detectDocker();
    const wsl = detectWSL();
    const ci = detectCI();
    return {
        ide,
        shell,
        container: {
            isDocker,
            isWSL: wsl.isWSL,
            isCI: ci.isCI,
            ciProvider: ci.provider,
            wslDistro: wsl.distro,
        },
    };
}
/**
 * Format dev environment as a readable string
 */
export function formatDevEnvironment(env) {
    const lines = [];
    lines.push(`IDE         : ${env.ide.name || "not detected"}`);
    lines.push(`Shell       : ${env.shell.name}`);
    lines.push(`Docker      : ${env.container.isDocker ? "Yes" : "No"}`);
    lines.push(`WSL         : ${env.container.isWSL ? `Yes (${env.container.wslDistro})` : "No"}`);
    lines.push(`CI          : ${env.container.isCI ? `Yes (${env.container.ciProvider})` : "No"}`);
    return lines.join("\n");
}
//# sourceMappingURL=dev-environment.js.map