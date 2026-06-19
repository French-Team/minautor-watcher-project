import { CorrectorRegistry } from "./correctors.js";
import { NotifierRegistry } from "./notifiers.js";
import { TriggerRuleManager, TriggerContext, TriggerResult, TriggerRule } from "./rules.js";
/**
 * Trigger module configuration
 */
export interface TriggerModuleConfig {
    configPath?: string;
    enabled?: boolean;
    autoCorrect?: boolean;
    notifyOnFailure?: boolean;
    maxExecutionTime?: number;
    parallelExecution?: boolean;
}
/**
 * Main trigger module that orchestrates corrections and notifications
 */
export declare class TriggerModule {
    private ruleManager;
    private correctorRegistry;
    private notifierRegistry;
    private config;
    private isRunning;
    private circuitBreakers;
    constructor(config?: TriggerModuleConfig, dependencies?: {
        ruleManager?: TriggerRuleManager;
        correctorRegistry?: CorrectorRegistry;
        notifierRegistry?: NotifierRegistry;
    });
    /**
     * Start the trigger module
     */
    start(): Promise<void>;
    /**
     * Stop the trigger module
     */
    stop(): Promise<void>;
    /**
     * Process a trigger event
     */
    processEvent(context: TriggerContext): Promise<TriggerResult[]>;
    /**
     * Execute multiple trigger rules (V5.6: parallel execution)
     */
    private executeRules;
    /**
     * Execute a single trigger rule
     */
    private executeRule;
    /**
     * Execute a single action
     */
    private executeAction;
    /**
     * Execute correction action with retry and circuit breaker
     */
    private executeCorrection;
    /**
     * Execute notification action
     */
    private executeNotification;
    /**
     * Execute logging action
     */
    private executeLogging;
    /**
     * Execute skip action
     */
    private executeSkip;
    /**
     * Execute custom action
     */
    private executeCustomAction;
    /**
     * Send error notification
     */
    private sendErrorNotification;
    /**
     * Get current status
     */
    getStatus(): {
        isRunning: boolean;
        enabled: boolean;
        ruleCount: number;
        enabledRuleCount: number;
        correctorCount: number;
        notifierCount: number;
        ruleStats: {
            totalRules: number;
            enabledRules: number;
            rulesByPriority: Record<string, number>;
            activeCooldowns: number;
        };
    };
    /**
     * Reload configuration
     */
    reloadConfig(): Promise<void>;
    /**
     * Add a custom rule
     */
    addRule(rule: TriggerRule): Promise<void>;
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
 * Factory function to create a trigger module
 */
export declare function createTriggerModule(config?: TriggerModuleConfig, dependencies?: {
    ruleManager?: TriggerRuleManager;
    correctorRegistry?: CorrectorRegistry;
    notifierRegistry?: NotifierRegistry;
}): TriggerModule;
/**
 * Quick setup function for common use cases
 */
export declare function setupTrigger(config?: TriggerModuleConfig): Promise<TriggerModule>;
export default TriggerModule;
//# sourceMappingURL=index.d.ts.map