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
        severity?: "error" | "warning" | "info";
        metadataConditions?: Record<string, any>;
    };
    actions: Array<{
        type: "correct" | "notify" | "log" | "skip" | "custom";
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
export interface TriggerContext {
    filePath: string;
    eventType: string;
    error?: any;
    metadata?: Record<string, any>;
    timestamp: Date;
}
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
export declare class TriggerRuleManager {
    private rules;
    private configPath;
    private configSchema;
    private cooldowns;
    constructor(configPath?: string);
    private loadConfig;
    private convertLegacyConfig;
    private loadDefaultRules;
    getRules(): TriggerRule[];
    getEnabledRules(): TriggerRule[];
    getApplicableRules(context: TriggerContext): TriggerRule[];
    private ruleMatchesContext;
    addRule(rule: TriggerRule): Promise<void>;
    removeRule(ruleId: string): Promise<boolean>;
    toggleRule(ruleId: string, enabled: boolean): Promise<boolean>;
    updateCooldown(ruleId: string): void;
    getStats(): {
        totalRules: number;
        enabledRules: number;
        rulesByPriority: Record<string, number>;
        activeCooldowns: number;
    };
    saveConfig(): Promise<void>;
    reloadConfig(): Promise<void>;
    exportConfig(): {
        rules: TriggerRule[];
    };
    importConfig(config: {
        rules: TriggerRule[];
    }): Promise<void>;
}
export declare function createTriggerRuleManager(configPath?: string): TriggerRuleManager;
export default TriggerRuleManager;
//# sourceMappingURL=rules.d.ts.map