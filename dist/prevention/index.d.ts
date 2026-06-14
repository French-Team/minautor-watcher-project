import { ValidatorRegistry } from "./validators.js";
import { ScriptRunner } from "./scripts.js";
import { PreventionConfigManager, PreventionRule } from "./config.js";
/**
 * Prevention result for a file
 */
export interface PreventionResult {
    filePath: string;
    success: boolean;
    errors: Array<{
        rule: string;
        message: string;
        severity: "error" | "warning" | "info";
    }>;
    warnings: Array<{
        rule: string;
        message: string;
        severity: "error" | "warning" | "info";
    }>;
    executionTime: number;
    metadata?: Record<string, unknown>;
}
/**
 * Prevention module configuration
 */
export interface PreventionModuleConfig {
    configPath?: string;
    enabled?: boolean;
    failOnError?: boolean;
    failOnWarning?: boolean;
    maxExecutionTime?: number;
    parallelExecution?: boolean;
}
/**
 * Main prevention module that orchestrates validation and script execution
 */
export declare class PreventionModule {
    private configManager;
    private validatorRegistry;
    private scriptRunner;
    private config;
    private isRunning;
    private constructor();
    /**
     * Create and initialize a PreventionModule (async factory)
     */
    static create(config?: PreventionModuleConfig, dependencies?: {
        validatorRegistry?: ValidatorRegistry;
        scriptRunner?: ScriptRunner;
        configManager?: PreventionConfigManager;
    }): Promise<PreventionModule>;
    /**
     * Start the prevention module
     */
    start(): Promise<void>;
    /**
     * Stop the prevention module
     */
    stop(): Promise<void>;
    /**
     * Process a file through all applicable prevention rules
     */
    processFile(filePath: string): Promise<PreventionResult>;
    /**
     * Process a single rule for a file
     */
    private processRule;
    /**
     * Update component configurations based on current settings
     */
    private updateComponentConfigurations;
    /**
     * Get current status
     */
    getStatus(): {
        isRunning: boolean;
        enabled: boolean;
        ruleCount: number;
        enabledRuleCount: number;
        validatorCount: number;
        scriptCount: number;
        configStats: {
            totalRules: number;
            enabledRules: number;
            rulesByCategory: Record<string, number>;
            rulesBySeverity: Record<string, number>;
        };
    };
    /**
     * Reload configuration
     */
    reloadConfig(): Promise<void>;
    /**
     * Add a custom rule
     */
    addRule(rule: PreventionRule): Promise<void>;
    /**
     * Remove a rule
     */
    removeRule(ruleId: string): Promise<boolean>;
    /**
     * Toggle a rule
     */
    toggleRule(ruleId: string, enabled: boolean): Promise<boolean>;
}
/**
 * Factory function to create a prevention module (async)
 */
export declare function createPreventionModule(config?: PreventionModuleConfig, dependencies?: {
    validatorRegistry?: ValidatorRegistry;
    scriptRunner?: ScriptRunner;
    configManager?: PreventionConfigManager;
}): Promise<PreventionModule>;
/**
 * Quick setup function for common use cases
 */
export declare function setupPrevention(config?: PreventionModuleConfig): Promise<PreventionModule>;
export default PreventionModule;
//# sourceMappingURL=index.d.ts.map