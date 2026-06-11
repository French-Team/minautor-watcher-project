/**
 * Trigger rule definition
 */
export interface TriggerRule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    priority: number;
    conditions: {
        eventTypes?: string[];
        fileExtensions?: string[];
        filePatterns?: string[];
        errorPatterns?: string[];
        severity?: 'error' | 'warning' | 'info';
        metadataConditions?: Record<string, any>;
    };
    actions: Array<{
        type: 'correct' | 'notify' | 'log' | 'skip' | 'custom';
        target?: string;
        config?: Record<string, any>;
        delay?: number;
    }>;
    cooldown?: {
        enabled: boolean;
        period: number;
    };
    metadata?: Record<string, any>;
}
/**
 * Trigger execution context
 */
export interface TriggerContext {
    filePath: string;
    eventType: string;
    error?: any;
    metadata?: Record<string, any>;
    timestamp: Date;
}
/**
 * Trigger execution result
 */
export interface TriggerResult {
    ruleId: string;
    success: boolean;
    actions: Array<{
        type: string;
        success: boolean;
        result?: any;
        error?: Error;
    }>;
    executionTime: number;
    skipped?: boolean;
    cooldown?: boolean;
    error?: Error;
}
/**
 * Trigger rule manager
 */
export declare class TriggerRuleManager {
    private rules;
    private configPath;
    private configSchema;
    private cooldowns;
    constructor(configPath?: string);
    /**
     * Load configuration from file or use defaults
     */
    private loadConfig;
    /**
     * Load default trigger rules
     */
    private loadDefaultRules;
    /**
     * Get all rules
     */
    getRules(): TriggerRule[];
    /**
     * Get enabled rules
     */
    getEnabledRules(): TriggerRule[];
    /**
     * Get rules applicable to a context
     */
    getApplicableRules(context: TriggerContext): TriggerRule[];
    /**
     * Check if a rule matches the given context
     */
    private ruleMatchesContext;
    /**
     * Add a new rule
     */
    addRule(rule: TriggerRule): Promise<void>;
    /**
     * Remove a rule
     */
    removeRule(ruleId: string): Promise<boolean>;
    /**
     * Enable/disable a rule
     */
    toggleRule(ruleId: string, enabled: boolean): Promise<boolean>;
    /**
     * Update rule execution time for cooldown tracking
     */
    updateCooldown(ruleId: string): void;
    /**
     * Get configuration statistics
     */
    getStats(): {
        totalRules: number;
        enabledRules: number;
        rulesByPriority: Record<string, number>;
        activeCooldowns: number;
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
    exportConfig(): {
        rules: TriggerRule[];
    };
    /**
     * Import configuration from backup
     */
    importConfig(config: {
        rules: TriggerRule[];
    }): Promise<void>;
}
/**
 * Create a trigger rule manager
 */
export declare function createTriggerRuleManager(configPath?: string): TriggerRuleManager;
export default TriggerRuleManager;
//# sourceMappingURL=rules.d.ts.map