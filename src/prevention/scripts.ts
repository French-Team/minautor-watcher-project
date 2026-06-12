import { spawn } from "child_process";
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
    options?: ScriptExecutionOptions
  ): Promise<ScriptResult> {
    const script = this.scripts.get(name);
    if (!script) {
      throw new Error(`Script not found: ${name}`);
    }

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
      logger.info(`Script ${name} completed in ${executionTime}ms`);

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

    const results = await Promise.allSettled(
      applicableScripts.map((script) => this.executeScript(script.name))
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

      const child = spawn(command, args, {
        cwd,
        env,
        stdio: options?.captureOutput ? "pipe" : "inherit",
        signal,
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

      const timeout = options?.timeout || script.timeout || 30000;

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

        resolve({
          success: false,
          stdout,
          stderr: `${stderr}\n${error.message}`,
          exitCode: -1,
          executionTime: 0,
          error,
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
   * ESLint with auto-fix
   */
  eslintFix: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "eslint-fix",
    command: "npx",
    args: ["eslint", "--fix", "."],
    enabled: true,
    description: "Run ESLint with auto-fix on the project",
    timeout: 60000,
    ...config,
  }),

  /**
   * Prettier formatting
   */
  prettierFormat: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "prettier-format",
    command: "npx",
    args: ["prettier", "--write", "."],
    enabled: true,
    description: "Format code with Prettier",
    timeout: 30000,
    triggers: [".js", ".ts", ".jsx", ".tsx", ".json", ".md"],
    ...config,
  }),

  /**
   * TypeScript type checking
   */
  typescriptCheck: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "typescript-check",
    command: "npx",
    args: ["tsc", "--noEmit"],
    enabled: true,
    description: "Run TypeScript type checking",
    timeout: 30000,
    triggers: [".ts", ".tsx"],
    ...config,
  }),

  /**
   * Security audit
   */
  securityAudit: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "security-audit",
    command: "npm",
    args: ["audit"],
    enabled: true,
    description: "Run npm security audit",
    timeout: 60000,
    ...config,
  }),

  /**
   * Dependency vulnerability check
   */
  dependencyCheck: (config?: Partial<ScriptConfig>): ScriptConfig => ({
    name: "dependency-check",
    command: "npx",
    args: ["depcheck"],
    enabled: true,
    description: "Check for unused dependencies",
    timeout: 30000,
    ...config,
  }),
};

/**
 * Create script runner with predefined scripts
 */
export function createScriptRunner(): ScriptRunner {
  const runner = new ScriptRunner();

  // Add predefined scripts
  runner.addScript(PredefinedScripts.eslintFix());
  runner.addScript(PredefinedScripts.prettierFormat());
  runner.addScript(PredefinedScripts.typescriptCheck());
  runner.addScript(PredefinedScripts.securityAudit());
  runner.addScript(PredefinedScripts.dependencyCheck());

  return runner;
}

export default ScriptRunner;
