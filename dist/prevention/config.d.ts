/**
 * Prevention rule definition
 */
export interface PreventionRule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    severity: 'error' | 'warning' | 'info';
    category: 'syntax' | 'style' | 'security' | 'performance' | 'custom';
    validators: string[];
    scripts: string[];
    conditions?: {
        fileExtensions?: string[];
        filePatterns?: string[];
        minFileSize?: number;
        maxFileSize?: number;
    };
    actions?: {
        autoFix?: boolean;
        notifyOnFailure?: boolean;
        blockCommit?: boolean;
    };
    metadata?: Record<string, any>;
}
/**
 * Prevention configuration
 */
export interface PreventionConfig {
    enabled: boolean;
    rules: PreventionRule[];
    globalSettings: {
        failOnError: boolean;
        failOnWarning: boolean;
        maxExecutionTime: number;
        parallelExecution: boolean;
    };
    customValidators?: Array<{
        name: string;
        config: any;
    }>;
    customScripts?: Array<{
        name: string;
        config: any;
    }>;
}
/**
 * Configuration manager for prevention module
 */
export declare class PreventionConfigManager {
    private config;
    private configPath;
    private configSchema;
    constructor(configPath?: string);
    /**
     * Load configuration from file or use defaults
     */
    private loadDefaultConfig;
    /**
     * Get default configuration
     */
    private getDefaultConfig;
    /**
     * Get current configuration
     */
    getConfig(): PreventionConfig;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<PreventionConfig>): Promise<void>;
    /**
     * Get enabled rules
     */
    getEnabledRules(): PreventionRule[];
    /**
     * Get rules applicable to a file
     */
    getRulesForFile(filePath: string): PreventionRule[];
    /**
     * Add a new rule
     */
    addRule(rule: PreventionRule): Promise<void>;
    /**
     * Remove a rule
     */
    removeRule(ruleId: string): Promise<boolean>;
    /**
     * Enable/disable a rule
     */
    toggleRule(ruleId: string, enabled: boolean): Promise<boolean>;
    /**
     * Get configuration statistics
     */
    getStats(): {
        totalRules: number;
        enabledRules: number;
        rulesByCategory: Record<string, number>;
        rulesBySeverity: Record<string, number>;
    };
    /**
     * Save configuration to file
     */
    private saveConfig;
    /**
     * Reload configuration from file
     */
    reloadConfig(): Promise<void>;
    /**
     * Export configuration for backup
     */
    exportConfig(): PreventionConfig;
    /**
     * Import configuration from backup
     */
    importConfig(config: PreventionConfig): Promise<void>;
}
/**
 * Create a prevention configuration manager
 */
export declare function createPreventionConfig(configPath?: string): PreventionConfigManager;
export default PreventionConfigManager;
//# sourceMappingURL=config.d.ts.map