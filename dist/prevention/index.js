import { createValidatorRegistry, } from "./validators.js";
import { createScriptRunner } from "./scripts.js";
import { createPreventionConfig } from "./config.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("prevention");
/**
 * Main prevention module that orchestrates validation and script execution
 */
export class PreventionModule {
    configManager;
    validatorRegistry;
    scriptRunner;
    config;
    isRunning = false;
    constructor(config = {}) {
        this.config = {
            enabled: true,
            failOnError: true,
            failOnWarning: false,
            maxExecutionTime: 30000,
            parallelExecution: true,
            ...config,
        };
        // Initialize components
        this.configManager = createPreventionConfig(config.configPath);
        this.validatorRegistry = createValidatorRegistry();
        this.scriptRunner = createScriptRunner();
    }
    /**
     * Start the prevention module
     */
    async start() {
        if (this.isRunning) {
            logger.warn("Prevention module is already running");
            return;
        }
        try {
            logger.info("Starting prevention module...");
            // Update component configurations
            await this.updateComponentConfigurations();
            this.isRunning = true;
            logger.info("Prevention module started successfully");
        }
        catch (error) {
            logger.error("Failed to start prevention module:", error);
            throw error;
        }
    }
    /**
     * Stop the prevention module
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn("Prevention module is not running");
            return;
        }
        try {
            logger.info("Stopping prevention module...");
            // Stop all running scripts
            this.scriptRunner.stopAllScripts();
            this.isRunning = false;
            logger.info("Prevention module stopped successfully");
        }
        catch (error) {
            logger.error("Failed to stop prevention module:", error);
            throw error;
        }
    }
    /**
     * Process a file through all applicable prevention rules
     */
    async processFile(filePath) {
        if (!this.isRunning || !this.config.enabled) {
            return {
                filePath,
                success: true,
                errors: [],
                warnings: [],
                executionTime: 0,
            };
        }
        const startTime = Date.now();
        const result = {
            filePath,
            success: true,
            errors: [],
            warnings: [],
            executionTime: 0,
        };
        try {
            logger.info(`Processing file: ${filePath}`);
            // Get applicable rules for this file
            const applicableRules = this.configManager.getRulesForFile(filePath);
            if (applicableRules.length === 0) {
                logger.debug(`No prevention rules applicable for file: ${filePath}`);
                result.executionTime = Date.now() - startTime;
                return result;
            }
            logger.info(`Applying ${applicableRules.length} prevention rules to ${filePath}`);
            // Process each rule
            for (const rule of applicableRules) {
                try {
                    const ruleResult = await this.processRule(filePath, rule);
                    result.errors.push(...ruleResult.errors);
                    result.warnings.push(...ruleResult.warnings);
                    if (ruleResult.errors.length > 0 && this.config.failOnError) {
                        result.success = false;
                    }
                    if (ruleResult.warnings.length > 0 && this.config.failOnWarning) {
                        result.success = false;
                    }
                }
                catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    logger.error(`Error processing rule ${rule.id} for ${filePath}:`, error);
                    result.errors.push({
                        rule: rule.id,
                        message: `Rule processing failed: ${error.message}`,
                        severity: "error",
                    });
                    result.success = false;
                }
            }
            // Execute applicable scripts
            try {
                const scriptResults = await this.scriptRunner.executeScriptsForFile(filePath);
                for (const scriptResult of scriptResults) {
                    if (!scriptResult.success) {
                        result.errors.push({
                            rule: scriptResult.error?.message || "script-failed",
                            message: `Script execution failed: ${scriptResult.stderr}`,
                            severity: "error",
                        });
                        result.success = false;
                    }
                }
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                logger.error(`Error executing scripts for ${filePath}:`, error);
                result.errors.push({
                    rule: "script-execution",
                    message: `Script execution error: ${error.message}`,
                    severity: "error",
                });
                result.success = false;
            }
            result.executionTime = Date.now() - startTime;
            logger.info(`Prevention processing completed for ${filePath}: ${result.success ? "SUCCESS" : "FAILED"} ` +
                `(${result.errors.length} errors, ${result.warnings.length} warnings) in ${result.executionTime}ms`);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error(`Error in prevention processing for ${filePath}:`, error);
            result.success = false;
            result.errors.push({
                rule: "prevention-error",
                message: `Prevention processing failed: ${error.message}`,
                severity: "error",
            });
            result.executionTime = Date.now() - startTime;
        }
        return result;
    }
    /**
     * Process a single rule for a file
     */
    async processRule(filePath, rule) {
        const errors = [];
        const warnings = [];
        // Run validators
        for (const validatorName of rule.validators) {
            const validator = this.validatorRegistry.get(validatorName);
            if (validator && validator.isEnabled()) {
                try {
                    const validationResult = await validator.validate(filePath);
                    for (const err of validationResult.errors) {
                        errors.push({
                            rule: `${rule.id}:${err.rule}`,
                            message: err.message,
                            severity: err.severity || "error",
                        });
                    }
                    for (const warning of validationResult.warnings) {
                        warnings.push({
                            rule: `${rule.id}:${warning.rule}`,
                            message: warning.message,
                            severity: warning.severity || "warning",
                        });
                    }
                }
                catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    logger.error(`Validator ${validatorName} failed for rule ${rule.id}:`, error);
                    errors.push({
                        rule: `${rule.id}:${validatorName}`,
                        message: `Validator failed: ${error.message}`,
                        severity: "error",
                    });
                }
            }
        }
        return { errors, warnings };
    }
    /**
     * Update component configurations based on current settings
     */
    async updateComponentConfigurations() {
        const config = this.configManager.getConfig();
        // Update script runner with custom scripts
        if (config.customScripts) {
            for (const customScript of config.customScripts) {
                this.scriptRunner.addScript(customScript.config);
            }
        }
        // Update validator registry with custom validators
        if (config.customValidators) {
            for (const customValidator of config.customValidators) {
                // This would need to be implemented based on the specific validator type
                logger.info(`Custom validator ${customValidator.name} registered`);
            }
        }
    }
    /**
     * Get current status
     */
    getStatus() {
        const configStats = this.configManager.getStats();
        return {
            isRunning: this.isRunning,
            enabled: this.config.enabled ?? true,
            ruleCount: configStats.totalRules,
            enabledRuleCount: configStats.enabledRules,
            validatorCount: this.validatorRegistry.getAll().length,
            scriptCount: this.scriptRunner.getScripts().length,
            configStats,
        };
    }
    /**
     * Reload configuration
     */
    async reloadConfig() {
        await this.configManager.reloadConfig();
        await this.updateComponentConfigurations();
        logger.info("Configuration reloaded");
    }
    /**
     * Add a custom rule
     */
    async addRule(rule) {
        await this.configManager.addRule(rule);
        await this.updateComponentConfigurations();
    }
    /**
     * Remove a rule
     */
    async removeRule(ruleId) {
        const removed = await this.configManager.removeRule(ruleId);
        if (removed) {
            await this.updateComponentConfigurations();
        }
        return removed;
    }
    /**
     * Toggle a rule
     */
    async toggleRule(ruleId, enabled) {
        const toggled = await this.configManager.toggleRule(ruleId, enabled);
        if (toggled) {
            await this.updateComponentConfigurations();
        }
        return toggled;
    }
}
/**
 * Factory function to create a prevention module
 */
export function createPreventionModule(config) {
    return new PreventionModule(config);
}
/**
 * Quick setup function for common use cases
 */
export async function setupPrevention(config) {
    const module = createPreventionModule(config);
    await module.start();
    return module;
}
export default PreventionModule;
//# sourceMappingURL=index.js.map