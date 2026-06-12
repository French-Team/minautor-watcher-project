import fs from "fs-extra";
import path from "path";
import Joi from "joi";
import { Utils } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("prevention-config");
/**
 * Configuration manager for prevention module
 */
export class PreventionConfigManager {
    config;
    configPath;
    configSchema;
    constructor(configPath) {
        this.configPath =
            configPath || path.join(process.cwd(), "config", "prevention-rules.json");
        // Define configuration schema
        this.configSchema = Joi.object({
            enabled: Joi.boolean().default(true),
            rules: Joi.array()
                .items(Joi.object({
                id: Joi.string().required(),
                name: Joi.string().required(),
                description: Joi.string().required(),
                enabled: Joi.boolean().default(true),
                severity: Joi.string()
                    .valid("error", "warning", "info")
                    .default("warning"),
                category: Joi.string()
                    .valid("syntax", "style", "security", "performance", "custom")
                    .default("custom"),
                validators: Joi.array().items(Joi.string()).default([]),
                scripts: Joi.array().items(Joi.string()).default([]),
                conditions: Joi.object({
                    fileExtensions: Joi.array().items(Joi.string()),
                    filePatterns: Joi.array().items(Joi.string()),
                    minFileSize: Joi.number(),
                    maxFileSize: Joi.number(),
                }).optional(),
                actions: Joi.object({
                    autoFix: Joi.boolean().default(false),
                    notifyOnFailure: Joi.boolean().default(true),
                    blockCommit: Joi.boolean().default(false),
                }).optional(),
            }))
                .default([]),
            globalSettings: Joi.object({
                failOnError: Joi.boolean().default(true),
                failOnWarning: Joi.boolean().default(false),
                maxExecutionTime: Joi.number().default(30000),
                parallelExecution: Joi.boolean().default(true),
            }).default(),
        });
        // Load initial configuration
        this.config = this.loadDefaultConfig();
    }
    /**
     * Load configuration from file or use defaults
     */
    loadDefaultConfig() {
        try {
            if (fs.pathExistsSync(this.configPath)) {
                const fileConfig = Utils.readJsonFile(this.configPath);
                if (fileConfig) {
                    const { error, value } = this.configSchema.validate(fileConfig, {
                        allowUnknown: true,
                    });
                    if (error) {
                        logger.warn(`Configuration validation error: ${error.message}. Using defaults.`);
                    }
                    else {
                        logger.info("Configuration loaded from file");
                        return value;
                    }
                }
            }
        }
        catch (error) {
            logger.error("Error loading configuration:", error);
        }
        logger.info("Using default configuration");
        return this.getDefaultConfig();
    }
    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            enabled: true,
            rules: [
                {
                    id: "eslint-validation",
                    name: "ESLint Validation",
                    description: "Validate JavaScript/TypeScript code with ESLint",
                    enabled: true,
                    severity: "error",
                    category: "syntax",
                    validators: ["eslint"],
                    scripts: ["eslint-fix"],
                    conditions: {
                        fileExtensions: ["js", "ts", "jsx", "tsx"],
                    },
                    actions: {
                        autoFix: true,
                        notifyOnFailure: true,
                        blockCommit: true,
                    },
                },
                {
                    id: "prettier-formatting",
                    name: "Prettier Formatting",
                    description: "Format code with Prettier",
                    enabled: true,
                    severity: "warning",
                    category: "style",
                    validators: [],
                    scripts: ["prettier-format"],
                    conditions: {
                        fileExtensions: ["js", "ts", "jsx", "tsx", "json", "md"],
                    },
                    actions: {
                        autoFix: true,
                        notifyOnFailure: false,
                        blockCommit: false,
                    },
                },
                {
                    id: "json-validation",
                    name: "JSON Validation",
                    description: "Validate JSON file syntax",
                    enabled: true,
                    severity: "error",
                    category: "syntax",
                    validators: ["json"],
                    scripts: [],
                    conditions: {
                        fileExtensions: ["json"],
                    },
                    actions: {
                        autoFix: false,
                        notifyOnFailure: true,
                        blockCommit: true,
                    },
                },
                {
                    id: "typescript-checking",
                    name: "TypeScript Type Checking",
                    description: "Run TypeScript compiler for type checking",
                    enabled: true,
                    severity: "error",
                    category: "syntax",
                    validators: [],
                    scripts: ["typescript-check"],
                    conditions: {
                        fileExtensions: ["ts", "tsx"],
                    },
                    actions: {
                        autoFix: false,
                        notifyOnFailure: true,
                        blockCommit: true,
                    },
                },
                {
                    id: "security-audit",
                    name: "Security Audit",
                    description: "Check for security vulnerabilities in dependencies",
                    enabled: true,
                    severity: "warning",
                    category: "security",
                    validators: [],
                    scripts: ["security-audit"],
                    conditions: {
                        filePatterns: ["package.json"],
                    },
                    actions: {
                        autoFix: false,
                        notifyOnFailure: true,
                        blockCommit: false,
                    },
                },
                {
                    id: "dependency-check",
                    name: "Dependency Check",
                    description: "Check for unused dependencies",
                    enabled: true,
                    severity: "info",
                    category: "performance",
                    validators: [],
                    scripts: ["dependency-check"],
                    conditions: {
                        filePatterns: ["package.json"],
                    },
                    actions: {
                        autoFix: false,
                        notifyOnFailure: false,
                        blockCommit: false,
                    },
                },
            ],
            globalSettings: {
                failOnError: true,
                failOnWarning: false,
                maxExecutionTime: 30000,
                parallelExecution: true,
            },
        };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    async updateConfig(newConfig) {
        try {
            const updatedConfig = Utils.validateConfig({ ...this.config, ...newConfig }, this.configSchema);
            this.config = updatedConfig;
            // Save to file
            await Utils.writeJsonFile(this.configPath, this.config);
            logger.info("Configuration updated and saved");
        }
        catch (error) {
            logger.error("Error updating configuration:", error);
            throw error;
        }
    }
    /**
     * Get enabled rules
     */
    getEnabledRules() {
        return this.config.rules.filter((rule) => rule.enabled && this.config.enabled);
    }
    /**
     * Get rules applicable to a file
     */
    getRulesForFile(filePath) {
        const extension = Utils.getFileExtension(filePath);
        const enabledRules = this.getEnabledRules();
        return enabledRules.filter((rule) => {
            // Check file extension condition
            if (rule.conditions?.fileExtensions) {
                if (!rule.conditions.fileExtensions.includes(extension)) {
                    return false;
                }
            }
            // Check file pattern condition
            if (rule.conditions?.filePatterns) {
                const matchesPattern = rule.conditions.filePatterns.some((pattern) => filePath.includes(pattern));
                if (!matchesPattern) {
                    return false;
                }
            }
            // Check file size conditions
            if (rule.conditions?.minFileSize || rule.conditions?.maxFileSize) {
                try {
                    const stats = fs.statSync(filePath);
                    const fileSize = stats.size;
                    if (rule.conditions.minFileSize &&
                        fileSize < rule.conditions.minFileSize) {
                        return false;
                    }
                    if (rule.conditions.maxFileSize &&
                        fileSize > rule.conditions.maxFileSize) {
                        return false;
                    }
                }
                catch (error) {
                    logger.warn(`Could not check file size for ${filePath}:`, error);
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * Add a new rule
     */
    async addRule(rule) {
        // Validate the new rule
        const ruleSchema = this.configSchema
            .extract("rules")
            .extract("items");
        Utils.validateConfig(rule, ruleSchema);
        // Check if rule already exists
        const existingIndex = this.config.rules.findIndex((r) => r.id === rule.id);
        if (existingIndex >= 0) {
            this.config.rules[existingIndex] = rule;
        }
        else {
            this.config.rules.push(rule);
        }
        await this.saveConfig();
        logger.info(`Rule added/updated: ${rule.id}`);
    }
    /**
     * Remove a rule
     */
    async removeRule(ruleId) {
        const initialLength = this.config.rules.length;
        this.config.rules = this.config.rules.filter((rule) => rule.id !== ruleId);
        if (this.config.rules.length < initialLength) {
            await this.saveConfig();
            logger.info(`Rule removed: ${ruleId}`);
            return true;
        }
        return false;
    }
    /**
     * Enable/disable a rule
     */
    async toggleRule(ruleId, enabled) {
        const rule = this.config.rules.find((r) => r.id === ruleId);
        if (rule) {
            rule.enabled = enabled;
            await this.saveConfig();
            logger.info(`Rule ${ruleId} ${enabled ? "enabled" : "disabled"}`);
            return true;
        }
        return false;
    }
    /**
     * Get configuration statistics
     */
    getStats() {
        const enabledRules = this.getEnabledRules();
        const rulesByCategory = {};
        const rulesBySeverity = {};
        this.config.rules.forEach((rule) => {
            rulesByCategory[rule.category] =
                (rulesByCategory[rule.category] || 0) + 1;
            if (rule.enabled) {
                rulesBySeverity[rule.severity] =
                    (rulesBySeverity[rule.severity] || 0) + 1;
            }
        });
        return {
            totalRules: this.config.rules.length,
            enabledRules: enabledRules.length,
            rulesByCategory,
            rulesBySeverity,
        };
    }
    /**
     * Save configuration to file
     */
    async saveConfig() {
        try {
            await Utils.writeJsonFile(this.configPath, this.config);
        }
        catch (error) {
            logger.error("Error saving configuration:", error);
            throw error;
        }
    }
    /**
     * Reload configuration from file
     */
    async reloadConfig() {
        this.config = this.loadDefaultConfig();
        logger.info("Configuration reloaded");
    }
    /**
     * Export configuration for backup
     */
    exportConfig() {
        return JSON.parse(JSON.stringify(this.config));
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
        this.config = config;
        await this.saveConfig();
        logger.info("Configuration imported successfully");
    }
}
/**
 * Create a prevention configuration manager
 */
export function createPreventionConfig(configPath) {
    return new PreventionConfigManager(configPath);
}
export default PreventionConfigManager;
//# sourceMappingURL=config.js.map