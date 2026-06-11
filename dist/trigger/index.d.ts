import { TriggerContext, TriggerResult } from './rules.js';
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
    constructor(config?: TriggerModuleConfig);
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
     * Execute multiple trigger rules
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
     * Execute correction action
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
        correctorCount: number;
        notifierCount: number;
        ruleStats: any;
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
 * Factory function to create a trigger module
 */
export declare function createTriggerModule(config?: TriggerModuleConfig): TriggerModule;
/**
 * Quick setup function for common use cases
 */
export declare function setupTrigger(config?: TriggerModuleConfig): Promise<TriggerModule>;
export default TriggerModule;
//# sourceMappingURL=index.d.ts.map