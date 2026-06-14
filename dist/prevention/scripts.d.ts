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
    executeScript(name: string, options?: ScriptExecutionOptions): Promise<ScriptResult>;
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
     * ESLint with auto-fix
     */
    eslintFix: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * Prettier formatting
     */
    prettierFormat: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * TypeScript type checking
     */
    typescriptCheck: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * Security audit
     */
    securityAudit: (config?: Partial<ScriptConfig>) => ScriptConfig;
    /**
     * Dependency vulnerability check
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