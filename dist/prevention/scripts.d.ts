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
    toolErrors?: Array<{
        tool: string;
        message: string;
    }>;
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
    triggers?: string[];
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
export declare class ScriptRunner {
    private scripts;
    private runningScripts;
    private concurrencyLimit;
    /**
     * Run tasks with concurrency limit
     */
    private runWithLimit;
    /**
     * Add a script to the runner
     */
    addScript(config: ScriptConfig): void;
    /**
     * Remove a script from the runner
     */
    removeScript(name: string): boolean;
    /**
     * Get all registered scripts
     */
    getScripts(): ScriptConfig[];
    /**
     * Execute a script by name
     */
    executeScript(name: string, options?: ScriptExecutionOptions, filePath?: string): Promise<ScriptResult>;
    /**
     * Execute all scripts that match the given file path
     */
    executeScriptsForFile(filePath: string): Promise<ScriptResult[]>;
    /**
     * Stop a running script
     */
    stopScript(name: string): boolean;
    /**
     * Stop all running scripts
     */
    stopAllScripts(): void;
    /**
     * Check if a script should be executed for a file
     */
    private shouldExecuteScriptForFile;
    /**
     * Execute a command with proper error handling and timeout
     */
    private executeCommand;
}
/**
 * Predefined script configurations
 */
export declare const PredefinedScripts: {
    /**
     * ESLint with auto-fix (targets specific file, not entire project)
     */
    eslintFix: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * Prettier formatting (targets specific file)
     */
    prettierFormat: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * TypeScript type checking (project-wide, cannot target single file)
     */
    typescriptCheck: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * Security audit (disabled by default - too heavy for file watcher)
     */
    securityAudit: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * Dependency check (disabled by default - too heavy for file watcher)
     */
    dependencyCheck: (config?: Partial<ScriptConfig>) => ScriptConfig;
};
/**
 * Create script runner with predefined scripts
 */
export declare function createScriptRunner(options?: {
    skipDefaults?: boolean;
}): ScriptRunner;
export default ScriptRunner;
//# sourceMappingURL=scripts.d.ts.map