import fs from 'fs-extra';
import path from 'path';
import Joi from 'joi';
import { Utils } from '../shared/utils.js';
import { createChildLogger } from '../shared/logger.js';
const logger = createChildLogger('trigger-rules');
/**
 * Trigger rule manager
 */
export class TriggerRuleManager {
    rules = [];
    configPath;
    configSchema;
    cooldowns = new Map(); // ruleId -> last execution time
    constructor(configPath) {
        this.configPath = configPath || path.join(process.cwd(), 'config', 'trigger-rules.json');
        // Define configuration schema
        this.configSchema = Joi.object({
            rules: Joi.array().items(Joi.object({
                id: Joi.string().required(),
                name: Joi.string().required(),
                description: Joi.string().required(),
                enabled: Joi.boolean().default(true),
                priority: Joi.number().default(0),
                conditions: Joi.object({
                    eventTypes: Joi.array().items(Joi.string()),
                    fileExtensions: Joi.array().items(Joi.string()),
                    filePatterns: Joi.array().items(Joi.string()),
                    errorPatterns: Joi.array().items(Joi.string()),
                    severity: Joi.string().valid('error', 'warning', 'info'),
                    metadataConditions: Joi.object().default({}),
                }).default(),
                actions: Joi.array().items(Joi.object({
                    type: Joi.string().valid('correct', 'notify', 'log', 'skip', 'custom').required(),
                    target: Joi.string(),
                    config: Joi.object().default({}),
                    delay: Joi.number().default(0),
                })).default([]),
                cooldown: Joi.object({
                    enabled: Joi.boolean().default(false),
                    period: Joi.number().default(60000), // 1 minute default
                }).default(),
            })).default([]),
        });
        // Load configuration
        this.loadConfig();
    }
    /**
     * Load configuration from file or use defaults
     */
    loadConfig() {
        try {
            if (fs.pathExistsSync(this.configPath)) {
                const fileConfig = Utils.readJsonFile(this.configPath);
                if (fileConfig) {
                    const { error, value } = this.configSchema.validate(fileConfig, { allowUnknown: true });
                    if (error) {
                        logger.warn(`Configuration validation error: ${error.message}. Using defaults.`);
                    }
                    else {
                        this.rules = value.rules || [];
                        logger.info(`Loaded ${this.rules.length} trigger rules from configuration`);
                        return;
                    }
                }
            }
        }
        catch (error) {
            logger.error('Error loading trigger rules configuration:', error);
        }
        logger.info('Using default trigger rules');
        this.loadDefaultRules();
    }
    /**
     * Load default trigger rules
     */
    loadDefaultRules() {
        this.rules = [
            {
                id: 'auto-correct-eslint',
                name: 'Auto-correct ESLint errors',
                description: 'Automatically fix ESLint errors in JavaScript/TypeScript files',
                enabled: true,
                priority: 10,
                conditions: {
                    eventTypes: ['fileModified'],
                    fileExtensions: ['js', 'ts', 'jsx', 'tsx'],
                    errorPatterns: ['eslint'],
                },
                actions: [
                    {
                        type: 'correct',
                        target: 'eslint-fix',
                        delay: 100,
                    },
                ],
            },
            {
                id: 'format-with-prettier',
                name: 'Format with Prettier',
                description: 'Format supported files with Prettier',
                enabled: true,
                priority: 5,
                conditions: {
                    eventTypes: ['fileModified'],
                    fileExtensions: ['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'css', 'scss'],
                },
                actions: [
                    {
                        type: 'correct',
                        target: 'prettier-format',
                        delay: 50,
                    },
                ],
            },
            {
                id: 'notify-on-correction-failure',
                name: 'Notify on correction failure',
                description: 'Send notification when automatic corrections fail',
                enabled: true,
                priority: 1,
                conditions: {
                    eventTypes: ['correctionFailed'],
                    severity: 'error',
                },
                actions: [
                    {
                        type: 'notify',
                        target: 'slack,email',
                        config: {
                            level: 'error',
                        },
                    },
                ],
            },
            {
                id: 'log-file-changes',
                name: 'Log file changes',
                description: 'Log all file changes for audit purposes',
                enabled: true,
                priority: 0,
                conditions: {
                    eventTypes: ['fileModified', 'fileAdded', 'fileDeleted'],
                },
                actions: [
                    {
                        type: 'log',
                        config: {
                            level: 'info',
                        },
                    },
                ],
            },
            {
                id: 'skip-large-files',
                name: 'Skip large files',
                description: 'Skip processing very large files to avoid performance issues',
                enabled: true,
                priority: 100, // High priority to run first
                conditions: {
                    eventTypes: ['fileModified'],
                },
                actions: [
                    {
                        type: 'skip',
                        config: {
                            maxFileSize: 5 * 1024 * 1024, // 5MB
                        },
                    },
                ],
            },
        ];
        logger.info(`Loaded ${this.rules.length} default trigger rules`);
    }
    /**
     * Get all rules
     */
    getRules() {
        return [...this.rules];
    }
    /**
     * Get enabled rules
     */
    getEnabledRules() {
        return this.rules.filter(rule => rule.enabled);
    }
    /**
     * Get rules applicable to a context
     */
    getApplicableRules(context) {
        const enabledRules = this.getEnabledRules();
        return enabledRules
            .filter(rule => this.ruleMatchesContext(rule, context))
            .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)
    }
    /**
     * Check if a rule matches the given context
     */
    ruleMatchesContext(rule, context) {
        // Check event type condition
        if (rule.conditions.eventTypes) {
            if (!rule.conditions.eventTypes.includes(context.eventType)) {
                return false;
            }
        }
        // Check file extension condition
        if (rule.conditions.fileExtensions) {
            const extension = Utils.getFileExtension(context.filePath);
            if (!rule.conditions.fileExtensions.includes(extension)) {
                return false;
            }
        }
        // Check file pattern condition
        if (rule.conditions.filePatterns) {
            const fileName = path.basename(context.filePath);
            const matchesPattern = rule.conditions.filePatterns.some(pattern => fileName.includes(pattern) || context.filePath.includes(pattern));
            if (!matchesPattern) {
                return false;
            }
        }
        // Check error pattern condition
        if (rule.conditions.errorPatterns && context.error) {
            const errorMessage = context.error.message || String(context.error);
            const matchesErrorPattern = rule.conditions.errorPatterns.some(pattern => errorMessage.includes(pattern));
            if (!matchesErrorPattern) {
                return false;
            }
        }
        // Check severity condition
        if (rule.conditions.severity && context.metadata?.severity) {
            if (rule.conditions.severity !== context.metadata.severity) {
                return false;
            }
        }
        // Check metadata conditions
        if (rule.conditions.metadataConditions) {
            for (const [key, value] of Object.entries(rule.conditions.metadataConditions)) {
                if (context.metadata?.[key] !== value) {
                    return false;
                }
            }
        }
        // Check cooldown
        if (rule.cooldown?.enabled) {
            const lastExecution = this.cooldowns.get(rule.id) || 0;
            const now = Date.now();
            const cooldownPeriod = rule.cooldown.period;
            if (now - lastExecution < cooldownPeriod) {
                return false;
            }
        }
        return true;
    }
    /**
     * Add a new rule
     */
    async addRule(rule) {
        // Validate the new rule
        const ruleSchema = this.configSchema.extract('rules').extract('items');
        Utils.validateConfig(rule, ruleSchema);
        // Check if rule already exists
        const existingIndex = this.rules.findIndex(r => r.id === rule.id);
        if (existingIndex >= 0) {
            this.rules[existingIndex] = rule;
        }
        else {
            this.rules.push(rule);
        }
        await this.saveConfig();
        logger.info(`Trigger rule added/updated: ${rule.id}`);
    }
    /**
     * Remove a rule
     */
    async removeRule(ruleId) {
        const initialLength = this.rules.length;
        this.rules = this.rules.filter(rule => rule.id !== ruleId);
        if (this.rules.length < initialLength) {
            await this.saveConfig();
            logger.info(`Trigger rule removed: ${ruleId}`);
            return true;
        }
        return false;
    }
    /**
     * Enable/disable a rule
     */
    async toggleRule(ruleId, enabled) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (rule) {
            rule.enabled = enabled;
            await this.saveConfig();
            logger.info(`Trigger rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        }
        return false;
    }
    /**
     * Update rule execution time for cooldown tracking
     */
    updateCooldown(ruleId) {
        this.cooldowns.set(ruleId, Date.now());
    }
    /**
     * Get configuration statistics
     */
    getStats() {
        const enabledRules = this.getEnabledRules();
        const rulesByPriority = {};
        this.rules.forEach(rule => {
            const priorityRange = `${Math.floor(rule.priority / 10) * 10}-${Math.floor(rule.priority / 10) * 10 + 9}`;
            rulesByPriority[priorityRange] = (rulesByPriority[priorityRange] || 0) + 1;
        });
        return {
            totalRules: this.rules.length,
            enabledRules: enabledRules.length,
            rulesByPriority,
            activeCooldowns: this.cooldowns.size,
        };
    }
    /**
     * Save configuration to file
     */
    async saveConfig() {
        try {
            await Utils.writeJsonFile(this.configPath, { rules: this.rules });
        }
        catch (error) {
            logger.error('Error saving trigger rules configuration:', error);
            throw error;
        }
    }
    /**
     * Reload configuration from file
     */
    async reloadConfig() {
        this.cooldowns.clear(); // Reset cooldowns on reload
        this.loadConfig();
        logger.info('Trigger rules configuration reloaded');
    }
    /**
     * Export configuration for backup
     */
    exportConfig() {
        return { rules: JSON.parse(JSON.stringify(this.rules)) };
    }
    /**
     * Import configuration from backup
     */
    async importConfig(config) {
        // Validate the imported config
        const { error } = this.configSchema.validate(config);
        if (error) {
            throw new Error(`Invalid configuration: ${error.message}`);
        }
        this.rules = config.rules;
        await this.saveConfig();
        logger.info('Trigger rules configuration imported successfully');
    }
}
/**
 * Create a trigger rule manager
 */
export function createTriggerRuleManager(configPath) {
    return new TriggerRuleManager(configPath);
}
export default TriggerRuleManager;
//# sourceMappingURL=rules.js.map