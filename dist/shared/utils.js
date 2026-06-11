import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import Joi from 'joi';
import logger from './logger.js';
/**
 * Utility class for common file and system operations
 */
export class Utils {
    static fs = fs;
    /**
     * Check if a file path exists
     */
    static async pathExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Read and parse a JSON file safely
     */
    static async readJsonFile(filePath) {
        try {
            if (!(await this.pathExists(filePath))) {
                logger.warn(`File not found: ${filePath}`);
                return null;
            }
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            logger.error(`Error reading JSON file ${filePath}:`, error);
            return null;
        }
    }
    /**
     * Write JSON to a file with pretty formatting
     */
    static async writeJsonFile(filePath, data) {
        try {
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeJson(filePath, data, { spaces: 2 });
            logger.info(`JSON file written: ${filePath}`);
            return true;
        }
        catch (error) {
            logger.error(`Error writing JSON file ${filePath}:`, error);
            return false;
        }
    }
    /**
     * Find files matching a pattern using glob
     */
    static async findFiles(pattern, cwd) {
        try {
            const options = cwd ? { cwd } : {};
            return await glob(pattern, options);
        }
        catch (error) {
            logger.error(`Error finding files with pattern ${pattern}:`, error);
            return [];
        }
    }
    /**
     * Get file extension from path
     */
    static getFileExtension(filePath) {
        return path.extname(filePath).toLowerCase().slice(1);
    }
    /**
     * Check if file extension is in the allowed list
     */
    static isAllowedExtension(filePath, allowedExtensions) {
        const extension = this.getFileExtension(filePath);
        return allowedExtensions.includes(extension);
    }
    /**
     * Check if path should be excluded based on patterns
     */
    static shouldExcludePath(filePath, excludePatterns) {
        const relativePath = path.relative(process.cwd(), filePath);
        return excludePatterns.some(pattern => {
            // Support for wildcards and simple patterns
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(`^${regexPattern}`).test(relativePath);
        });
    }
    /**
     * Debounce function to limit the rate of function calls
     */
    static debounce(func, wait) {
        let timeout = null;
        return (...args) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => func(...args), wait);
        };
    }
    /**
     * Sleep utility for delays
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Validate configuration object against schema
     */
    static validateConfig(config, schema) {
        const { error, value } = schema.validate(config, { allowUnknown: true });
        if (error) {
            logger.error('Configuration validation error:', error.details);
            throw new Error(`Invalid configuration: ${error.details[0].message}`);
        }
        return value;
    }
}
/**
 * Configuration schemas for validation
 */
export const ConfigSchemas = {
    watcherConfig: Joi.object({
        watchDir: Joi.string().required(),
        excludedDirs: Joi.array().items(Joi.string()).default([]),
        watchExtensions: Joi.array().items(Joi.string()).default(['js', 'ts', 'jsx', 'tsx']),
        processingDelay: Joi.number().default(100),
    }),
    preventionRules: Joi.object({
        rules: Joi.array().items(Joi.object({
            id: Joi.string().required(),
            enabled: Joi.boolean().default(true),
            severity: Joi.string().valid('error', 'warn').default('error'),
            extensions: Joi.array().items(Joi.string()),
        })),
    }),
    triggerRules: Joi.object({
        autoCorrect: Joi.object({
            enabled: Joi.boolean().default(true),
            maxFileSize: Joi.string().default('1MB'),
            timeout: Joi.number().default(30000),
        }),
        corrections: Joi.array().items(Joi.object({
            ruleId: Joi.string().required(),
            enabled: Joi.boolean().default(true),
            action: Joi.string().required(),
        })),
    }),
};
export default Utils;
//# sourceMappingURL=utils.js.map