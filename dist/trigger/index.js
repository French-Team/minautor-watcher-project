import { createCorrectorRegistry } from "./correctors.js";
import { createNotifierRegistry, NotificationUtils, } from "./notifiers.js";
import { createTriggerRuleManager, } from "./rules.js";
import { Utils } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("trigger");
/**
 * Main trigger module that orchestrates corrections and notifications
 */
export class TriggerModule {
    ruleManager;
    correctorRegistry;
    notifierRegistry;
    config;
    isRunning = false;
    constructor(config = {}) {
        this.config = {
            enabled: true,
            autoCorrect: true,
            notifyOnFailure: true,
            maxExecutionTime: 30000,
            parallelExecution: true,
            ...config,
        };
        // Initialize components
        this.ruleManager = createTriggerRuleManager(config.configPath);
        this.correctorRegistry = createCorrectorRegistry();
        this.notifierRegistry = createNotifierRegistry();
    }
    /**
     * Start the trigger module
     */
    async start() {
        if (this.isRunning) {
            logger.warn("Trigger module is already running");
            return;
        }
        try {
            logger.info("Starting trigger module...");
            this.isRunning = true;
            logger.info("Trigger module started successfully");
        }
        catch (error) {
            logger.error("Failed to start trigger module:", error);
            throw error;
        }
    }
    /**
     * Stop the trigger module
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn("Trigger module is not running");
            return;
        }
        try {
            logger.info("Stopping trigger module...");
            this.isRunning = false;
            logger.info("Trigger module stopped successfully");
        }
        catch (error) {
            logger.error("Failed to stop trigger module:", error);
            throw error;
        }
    }
    /**
     * Process a trigger event
     */
    async processEvent(context) {
        if (!this.isRunning || !this.config.enabled) {
            logger.debug("Trigger module is disabled or not running");
            return [];
        }
        try {
            logger.info(`Processing trigger event: ${context.eventType} for ${context.filePath}`);
            // Get applicable rules for this context
            const applicableRules = this.ruleManager.getApplicableRules(context);
            if (applicableRules.length === 0) {
                logger.debug(`No trigger rules applicable for event: ${context.eventType}`);
                return [];
            }
            logger.info(`Executing ${applicableRules.length} trigger rules for ${context.eventType}`);
            // Execute rules
            const results = await this.executeRules(applicableRules, context);
            // Update cooldowns for executed rules
            results.forEach((result) => {
                if (result.success && !result.skipped) {
                    this.ruleManager.updateCooldown(result.ruleId);
                }
            });
            return results;
        }
        catch (error) {
            logger.error(`Error processing trigger event:`, error);
            // Send error notification if configured
            if (this.config.notifyOnFailure) {
                await this.sendErrorNotification("Trigger Processing Error", error, context);
            }
            return [];
        }
    }
    /**
     * Execute multiple trigger rules
     */
    async executeRules(rules, context) {
        const results = [];
        for (const rule of rules) {
            try {
                const result = await this.executeRule(rule, context);
                results.push(result);
                if (result.success) {
                    logger.info(`Trigger rule ${rule.id} executed successfully`);
                }
                else {
                    logger.warn(`Trigger rule ${rule.id} failed`);
                }
            }
            catch (error) {
                logger.error(`Error executing trigger rule ${rule.id}:`, error);
                results.push({
                    ruleId: rule.id,
                    success: false,
                    actions: [],
                    executionTime: 0,
                    error: error instanceof Error ? error : new Error(String(error)),
                });
            }
        }
        return results;
    }
    /**
     * Execute a single trigger rule
     */
    async executeRule(rule, context) {
        const startTime = Date.now();
        const result = {
            ruleId: rule.id,
            success: true,
            actions: [],
            executionTime: 0,
        };
        try {
            // Execute each action in the rule
            for (const action of rule.actions) {
                try {
                    // Apply delay if specified
                    if (action.delay && action.delay > 0) {
                        await Utils.sleep(action.delay);
                    }
                    const actionResult = await this.executeAction(action, context);
                    result.actions.push(actionResult);
                    if (!actionResult.success) {
                        result.success = false;
                    }
                }
                catch (error) {
                    logger.error(`Error executing action ${action.type}:`, error);
                    result.actions.push({
                        type: action.type,
                        success: false,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                    result.success = false;
                }
            }
        }
        catch (error) {
            logger.error(`Error in trigger rule ${rule.id}:`, error);
            result.success = false;
            result.actions.push({
                type: "rule-execution",
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            });
        }
        result.executionTime = Date.now() - startTime;
        return result;
    }
    /**
     * Execute a single action
     */
    async executeAction(action, context) {
        try {
            switch (action.type) {
                case "correct":
                    return await this.executeCorrection(action, context);
                case "notify":
                    return await this.executeNotification(action, context);
                case "log":
                    return await this.executeLogging(action, context);
                case "skip":
                    return await this.executeSkip(action, context);
                case "custom":
                    return await this.executeCustomAction(action, context);
                default:
                    throw new Error(`Unknown action type: ${action.type}`);
            }
        }
        catch (error) {
            return {
                type: action.type,
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
    /**
     * Execute correction action
     */
    async executeCorrection(action, context) {
        if (!this.config.autoCorrect) {
            return {
                type: "correct",
                success: true, // Skipped, not failed
                result: "Auto-correction disabled",
            };
        }
        try {
            const correctorName = action.target;
            const corrector = this.correctorRegistry.get(correctorName);
            if (!corrector) {
                throw new Error(`Corrector not found: ${correctorName}`);
            }
            if (!corrector.isEnabled()) {
                return {
                    type: "correct",
                    success: true, // Skipped, not failed
                    result: `Corrector ${correctorName} is disabled`,
                };
            }
            const correctionResults = await this.correctorRegistry.applyCorrections(context.filePath, context.error);
            const success = correctionResults.every((result) => result.success);
            return {
                type: "correct",
                success,
                result: correctionResults,
            };
        }
        catch (error) {
            return {
                type: "correct",
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
    /**
     * Execute notification action
     */
    async executeNotification(action, context) {
        try {
            const channels = action.target.split(",").map((c) => c.trim());
            const level = action.config?.level || "info";
            // Create notification data based on context
            let notificationData;
            if (context.error) {
                notificationData = NotificationUtils.createErrorNotification(`Trigger Rule: ${context.eventType}`, context.error, context.filePath, { ruleId: context.metadata?.ruleId });
            }
            else {
                notificationData = NotificationUtils.createFileNotification(`Trigger Rule: ${context.eventType}`, `File ${context.eventType}: ${context.filePath}`, context.filePath, level, { ruleId: context.metadata?.ruleId });
            }
            const results = await this.notifierRegistry.sendToChannels(channels, notificationData);
            const success = results.every((result) => result.success);
            return {
                type: "notify",
                success,
                result: results,
            };
        }
        catch (error) {
            return {
                type: "notify",
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
    /**
     * Execute logging action
     */
    async executeLogging(action, context) {
        try {
            const logLevel = action.config?.level || "info";
            const message = `Trigger rule executed: ${context.eventType} for ${context.filePath}`;
            logger.log(logLevel, message, {
                ruleId: context.metadata?.ruleId,
                filePath: context.filePath,
                timestamp: context.timestamp,
            });
            return {
                type: "log",
                success: true,
                result: { level: logLevel, message },
            };
        }
        catch (error) {
            return {
                type: "log",
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
    /**
     * Execute skip action
     */
    async executeSkip(action, context) {
        try {
            // Check skip conditions
            if (action.config?.maxFileSize) {
                const stats = await Utils.fs.stat(context.filePath);
                if (stats.size > action.config.maxFileSize) {
                    logger.info(`Skipping file ${context.filePath} due to size limit`);
                    return {
                        type: "skip",
                        success: true,
                        result: {
                            reason: "file-too-large",
                            sizeLimit: action.config.maxFileSize,
                        },
                    };
                }
            }
            return {
                type: "skip",
                success: true,
                result: { reason: "skip-condition-met" },
            };
        }
        catch (error) {
            return {
                type: "skip",
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
    /**
     * Execute custom action
     */
    async executeCustomAction(action, context) {
        try {
            const handler = action.config?.handler;
            const script = action.config?.script;
            if (handler && typeof handler === "function") {
                const result = await handler(context);
                return { type: "custom", success: true, result };
            }
            if (script && typeof script === "string") {
                const { execSync } = await import("child_process");
                const cmd = script
                    .replace(/\{\{filePath\}\}/g, context.filePath)
                    .replace(/\{\{eventType\}\}/g, context.eventType);
                const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
                logger.info(`Custom script executed: ${script}`);
                return { type: "custom", success: true, result: output.trim() };
            }
            throw new Error("Custom action requires a config.handler function or config.script command");
        }
        catch (error) {
            return {
                type: "custom",
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
    /**
     * Send error notification
     */
    async sendErrorNotification(title, error, context) {
        try {
            const notificationData = NotificationUtils.createErrorNotification(title, error instanceof Error ? error : new Error(String(error)), context.filePath, {
                eventType: context.eventType,
                timestamp: context.timestamp,
            });
            await this.notifierRegistry.sendToAll(notificationData);
        }
        catch (notificationError) {
            logger.error("Failed to send error notification:", notificationError);
        }
    }
    /**
     * Get current status
     */
    getStatus() {
        const ruleStats = this.ruleManager.getStats();
        return {
            isRunning: this.isRunning,
            enabled: this.config.enabled ?? true,
            ruleCount: ruleStats.totalRules,
            enabledRuleCount: ruleStats.enabledRules,
            correctorCount: this.correctorRegistry.getAll().length,
            notifierCount: this.notifierRegistry.getAll().length,
            ruleStats,
        };
    }
    /**
     * Reload configuration
     */
    async reloadConfig() {
        await this.ruleManager.reloadConfig();
        logger.info("Trigger configuration reloaded");
    }
    /**
     * Add a custom rule
     */
    async addRule(rule) {
        await this.ruleManager.addRule(rule);
    }
    /**
     * Remove a rule
     */
    async removeRule(ruleId) {
        return await this.ruleManager.removeRule(ruleId);
    }
    /**
     * Toggle a rule
     */
    async toggleRule(ruleId, enabled) {
        return await this.ruleManager.toggleRule(ruleId, enabled);
    }
}
/**
 * Factory function to create a trigger module
 */
export function createTriggerModule(config) {
    return new TriggerModule(config);
}
/**
 * Quick setup function for common use cases
 */
export async function setupTrigger(config) {
    const module = createTriggerModule(config);
    await module.start();
    return module;
}
export default TriggerModule;
//# sourceMappingURL=index.js.map