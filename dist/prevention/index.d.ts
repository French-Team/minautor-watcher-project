/**
 * Prevention result for a file
 */
export interface PreventionResult {
    filePath: string;
    success: boolean;
    errors: Array<{
        rule: string;
        message: string;
        severity: 'error' | 'warning' | 'info';
    }>;
    warnings: Array<{
        rule: string;
        message: string;
        severity: 'error' | 'warning' | 'info';
    }>;
    executionTime: number;
    metadata?: Record<string, any>;
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
    constructor(config?: PreventionModuleConfig);
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
     * Set up graceful shutdown handlers
     */
    private setupGracefulShutdown;
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
        configStats: any;
    };
    /**
     * Reload configuration
     */
    reloadConfig(): Promise<void>;
    /**
     * Add a custom rule
     */
    addRule(rule: any): Promise<void>;
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
 * Factory function to create a prevention module
 */
export declare function createPreventionModule(config?: PreventionModuleConfig): PreventionModule;
/**
 * Quick setup function for common use cases
 */
export declare function setupPrevention(config?: PreventionModuleConfig): Promise<PreventionModule>;
export default PreventionModule;
//# sourceMappingURL=index.d.ts.map