import fs from "fs-extra";
import path from "path";
import Joi from "joi";
import { createChildLogger } from "./logger.js";
const logger = createChildLogger("config");
const configSchema = Joi.object({
    watchDir: Joi.string().required(),
    excludedDirs: Joi.array().items(Joi.string()),
    watchExtensions: Joi.array().items(Joi.string()),
    processingDelay: Joi.number().min(0),
    prevention: Joi.object({
        enabled: Joi.boolean(),
        rules: Joi.array(),
        globalSettings: Joi.object({
            failOnError: Joi.boolean(),
            failOnWarning: Joi.boolean(),
            maxExecutionTime: Joi.number(),
            parallelExecution: Joi.boolean(),
        }),
    }),
    trigger: Joi.object({
        rules: Joi.array(),
        enabled: Joi.boolean(),
    }),
    plugins: Joi.object({
        dir: Joi.string(),
        enabled: Joi.array().items(Joi.string()),
        disabled: Joi.array().items(Joi.string()),
    }),
});
/**
 * Load and merge configuration from multiple sources:
 * 1. Default values
 * 2. Legacy separate files (prevention-rules.json, trigger-rules.json)
 * 3. Unified config file (watcher.config.json)
 * 4. Environment variables
 */
export function loadUnifiedConfig(configDir) {
    const baseDir = configDir || path.join(process.cwd(), "config");
    // Default config
    const config = {
        watchDir: process.env.WATCH_DIR || "./src",
        excludedDirs: (process.env.EXCLUDED_DIRS || "node_modules,.git,dist,build").split(","),
        watchExtensions: (process.env.WATCH_EXTENSIONS || "js,ts,jsx,tsx,json,md").split(","),
        processingDelay: parseInt(process.env.PROCESSING_DELAY || "100"),
    };
    // Try loading unified config first
    const unifiedPath = path.join(baseDir, "watcher.config.json");
    if (fs.existsSync(unifiedPath)) {
        try {
            const unified = fs.readJsonSync(unifiedPath);
            Object.assign(config, unified);
            logger.info(`Loaded unified config from ${unifiedPath}`);
        }
        catch (error) {
            logger.error(`Error loading unified config: ${error}`);
        }
    }
    else {
        // Fall back to legacy separate files
        loadLegacyConfigs(config, baseDir);
    }
    // Validate
    const { error, value } = configSchema.validate(config, {
        abortEarly: false,
        stripUnknown: true,
    });
    if (error) {
        logger.warn(`Config validation warnings: ${error.details
            .map((d) => d.message)
            .join(", ")}`);
    }
    return value;
}
/**
 * Load legacy separate config files and merge into unified config
 */
function loadLegacyConfigs(config, baseDir) {
    // Load prevention rules
    const preventionPath = path.join(baseDir, "prevention-rules.json");
    if (fs.existsSync(preventionPath)) {
        try {
            const prevention = fs.readJsonSync(preventionPath);
            config.prevention = { ...config.prevention, ...prevention };
            logger.info(`Loaded legacy prevention config from ${preventionPath}`);
        }
        catch (error) {
            logger.error(`Error loading prevention config: ${error}`);
        }
    }
    // Load trigger rules
    const triggerPath = path.join(baseDir, "trigger-rules.json");
    if (fs.existsSync(triggerPath)) {
        try {
            const trigger = fs.readJsonSync(triggerPath);
            config.trigger = { ...config.trigger, ...trigger };
            logger.info(`Loaded legacy trigger config from ${triggerPath}`);
        }
        catch (error) {
            logger.error(`Error loading trigger config: ${error}`);
        }
    }
}
/**
 * Save unified config to disk
 */
export function saveUnifiedConfig(config, configDir) {
    const baseDir = configDir || path.join(process.cwd(), "config");
    const configPath = path.join(baseDir, "watcher.config.json");
    fs.ensureDirSync(path.dirname(configPath));
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    logger.info(`Saved unified config to ${configPath}`);
}
//# sourceMappingURL=unified-config.js.map