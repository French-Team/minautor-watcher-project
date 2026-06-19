import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import { Utils } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("prevention-scripts");

/**
 * Script execution result
 */
export interface ScriptResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  error?: Error;
  toolErrors?: Array<{ tool: string; message: string }>;
}

/**
 * Script configuration
 */
export interface ScriptConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  enabled: boolean;
  description?: string;
  triggers?: string[]; // File extensions or patterns that trigger this script
}

/**
 * Script execution options
 */
export interface ScriptExecutionOptions {
  timeout?: number;
  env?: Record<string, string>;
  cwd?: string;
  captureOutput?: boolean;
}

/**
 * Script runner class for executing custom prevention scripts
 */
export class ScriptRunner {
  private scripts: Map<string, ScriptConfig> = new Map();
  private runningScripts: Map<string, AbortController> = new Map();
  private concurrencyLimit: number = 2;

  /**
   * Run tasks with concurrency limit
   */
  private async runWithLimit<T>(
    tasks: (() => Promise<T>)[],
    limit: number
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    const executing = new Set<Promise<void>>();

    for (const task of tasks) {
      const p = task()
        .then((result) => {
          results.push({ status: "fulfilled", value: result });
        })
        .catch((reason) => {
          results.push({ status: "rejected", reason });
        })
        .then(() => {
          executing.delete(p);
        });

      executing.add(p);

      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Add a script to the runner
   */
  addScript(config: ScriptConfig): void {
    if (!config.enabled) {
      logger.debug(`Script ${config.name} is disabled, skipping registration`);
      return;
    }

    this.scripts.set(config.name, config);
    logger.info(
      `Script registered: ${config.name} - ${
        config.description || config.command
      }`
    );
  }

  /**
   * Remove a script from the runner
   */
  removeScript(name: string): boolean {
    const removed = this.scripts.delete(name);
    if (removed) {
      logger.info(`Script removed: ${name}`);
    }
    return removed;
  }

  /**
   * Get all registered scripts
   */
  getScripts(): ScriptConfig[] {
    return Array.from(this.scripts.values());
  }

  /**
   * Execute a script by name
   */
  async executeScript(
    name: string,
    options?: ScriptExecutionOptions,
    filePath?: string
  ): Promise<ScriptResult> {
    const originalScript = this.scripts.get(name);
    if (!originalScript) {
      throw new Error(`Script not found: ${name}`);
    }

    // Replace $FILE token in args with actual file path
    const script =
      filePath && originalScript.args
        ? {
            ...originalScript,
            args: originalScript.args.map((arg) =>
              arg.replace(/\$FILE/g, filePath)
            ),
          }
        : originalScript;

    const startTime = Date.now();
    const abortController = new AbortController();
    this.runningScripts.set(name, abortController);

    try {
      logger.info(`Executing script: ${name}`);

      const result = await this.executeCommand(
        script,
        options,
        abortController.signal
      );

      const executionTime = Date.now() - startTime;
      logger.success(`Script ${name} completed in ${executionTime}ms`);

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime,
        error: result.error,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Script ${name} failed after ${executionTime}ms:`, error);

      return {
        success: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        executionTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this.runningScripts.delete(name);
    }
  }

  /**
   * Execute all scripts that match the given file path
   */
  async executeScriptsForFile(filePath: string): Promise<ScriptResult[]> {
    const extension = Utils.getFileExtension(filePath);
    const applicableScripts: ScriptConfig[] = [];

    for (const script of this.scripts.values()) {
      if (this.shouldExecuteScriptForFile(script, filePath, extension)) {
        applicableScripts.push(script);
      }
    }

    if (applicableScripts.length === 0) {
      logger.debug(`No scripts applicable for file: ${filePath}`);
      return [];
    }

    logger.info(
      `Executing ${applicableScripts.length} scripts for file: ${filePath}`
    );

    // Run scripts from the file's directory so npx/npm resolve the project's local tools
    // Fall back to process.cwd() if the file directory doesn't exist
    const fileDir = path.dirname(filePath);
    let scriptCwd = fileDir;
    try {
      if (!(await fs.pathExists(fileDir))) {
        scriptCwd = process.cwd();
      }
    } catch {
      scriptCwd = process.cwd();
    }
    const scriptOptions: ScriptExecutionOptions = { cwd: scriptCwd };

    const results = await this.runWithLimit(
      applicableScripts.map(
        (script) => () => this.executeScript(script.name, scriptOptions, filePath)
      ),
      this.concurrencyLimit
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        logger.error(
          `Script ${applicableScripts[index].name} failed:`,
          result.reason
        );
        return {
          success: false,
          stdout: "",
          stderr: result.reason.message,
          exitCode: -1,
          executionTime: 0,
          error: result.reason,
        };
      }
    });
  }

  /**
   * Stop a running script
   */
  stopScript(name: string): boolean {
    const controller = this.runningScripts.get(name);
    if (controller) {
      controller.abort();
      this.runningScripts.delete(name);
      logger.info(`Script stopped: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Stop all running scripts
   */
  stopAllScripts(): void {
    for (const [name, controller] of this.runningScripts.entries()) {
      controller.abort();
      logger.info(`Script stopped: ${name}`);
    }
    this.runningScripts.clear();
  }

  /**
   * Check if a script should be executed for a file
   */
  private shouldExecuteScriptForFile(
    script: ScriptConfig,
    filePath: string,
    extension: string
  ): boolean {
    if (!script.triggers || script.triggers.length === 0) {
      return true; // No specific triggers, execute for all files
    }

    return script.triggers.some((trigger) => {
      if (trigger.startsWith(".")) {
        // Extension trigger
        return trigger === `.${extension}`;
      } else {
        // Pattern trigger
        return filePath.includes(trigger);
      }
    });
  }

  /**
   * Execute a command with proper error handling and timeout
   */
  private async executeCommand(
    script: ScriptConfig,
    options?: ScriptExecutionOptions,
    signal?: AbortSignal
  ): Promise<ScriptResult & { error?: Error }> {
    return new Promise((resolve) => {
      const command = script.command;
      const args = script.args || [];
      const cwd = options?.cwd || script.cwd || process.cwd();
      const env = { ...process.env, ...script.env, ...options?.env };

      logger.debug(`Executing command: ${command} ${args.join(" ")} in ${cwd}`);

      // On Windows, shell: true is needed for npx/npm/yarn/pnpm (.cmd wrappers)
      // and for any .cmd/.bat file (spawn cannot execute them directly)
      const isWindows = process.platform === "win32";
      const needsShell =
        isWindows &&
        (/^(npx|npm|yarn|pnpm)$/i.test(command) || /\.(cmd|bat)$/i.test(command));

      const child = spawn(command, args, {
        cwd,
        env,
        stdio: options?.captureOutput ? "pipe" : "inherit",
        signal,
        shell: needsShell,
      });

      let stdout = "";
      let stderr = "";

      if (options?.captureOutput && child.stdout && child.stderr) {
        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      const timeout = options?.timeout || script.timeout || 15000;

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);

        resolve({
          success: false,
          stdout,
          stderr: `${stderr}\nCommand timed out after ${timeout}ms`,
          exitCode: -1,
          executionTime: 0,
          error: new Error(`Command timed out after ${timeout}ms`),
        });
      }, timeout);

      child.on("close", (code, _signal) => {
        clearTimeout(timer);

        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0,
          executionTime: 0,
        });
      });

      child.on("error", (error) => {
        clearTimeout(timer);

        const toolErrors = (error as NodeJS.ErrnoException).code === "ENOENT"
          ? [{ tool: command, message: `${command} not found — tool may not be installed in the target project` }]
          : undefined;

        resolve({
          success: false,
          stdout,
          stderr: `${stderr}\n${error.message}`,
          exitCode: -1,
          executionTime: 0,
          error,
          toolErrors,
        });
      });

      // Handle abort signal
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        child.kill("SIGTERM");

        resolve({
          success: false,
          stdout,
          stderr: `${stderr}\nScript was aborted`,
          exitCode: -1,
          executionTime: 0,
          error: new Error("Script was aborted"),
        });
      });
    });
  }
}

/**
 * Predefined script configurations
 */
export const PredefinedScripts = {
  /**
   * ESLint with auto-fix (targets specific file, not entire project)
   */
  eslintFix: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "eslint-fix",
    command: "npx",
    args: ["eslint", "--fix", "$FILE"],
    enabled: true,
    description: "Run ESLint with auto-fix on the changed file",
    timeout: 15000,
    triggers: [".js", ".ts", ".jsx", ".tsx"],
    ...config,
  }),

  /**
   * Prettier formatting (targets specific file)
   */
  prettierFormat: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "prettier-format",
    command: "npx",
    args: ["prettier", "--write", "$FILE"],
    enabled: true,
    description: "Format code with Prettier",
    timeout: 10000,
    triggers: [".js", ".ts", ".jsx", ".tsx", ".json", ".md"],
    ...config,
  }),

  /**
   * TypeScript type checking (project-wide, cannot target single file)
   */
  typescriptCheck: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "typescript-check",
    command: "npx",
    args: ["tsc", "--noEmit"],
    enabled: false,
    description: "Run TypeScript type checking (disabled by default — project-wide, not per-file)",
    timeout: 15000,
    triggers: [".ts", ".tsx"],
    ...config,
  }),

  /**
   * Security audit (disabled by default - too heavy for file watcher)
   */
  securityAudit: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "security-audit",
    command: "npm",
    args: ["audit"],
    enabled: false,
    description: "Run npm security audit (disabled by default)",
    timeout: 15000,
    ...config,
  }),

  /**
   * Dependency check (disabled by default - too heavy for file watcher)
   */
  dependencyCheck: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "dependency-check",
    command: "npx",
    args: ["depcheck"],
    enabled: false,
    description: "Check for unused dependencies (disabled by default)",
    timeout: 15000,
    ...config,
  }),
};

/**
 * Create script runner with predefined scripts
 */
export function createScriptRunner(options?: {
  skipDefaults?: boolean;
}): ScriptRunner {
  const runner = new ScriptRunner();

  if (options?.skipDefaults) {
    return runner;
  }

  // Add predefined scripts
  runner.addScript(PredefinedScripts.eslintFix());
  runner.addScript(PredefinedScripts.prettierFormat());
  runner.addScript(PredefinedScripts.typescriptCheck());
  runner.addScript(PredefinedScripts.securityAudit());
  runner.addScript(PredefinedScripts.dependencyCheck());

  return runner;
}

export default ScriptRunner;
