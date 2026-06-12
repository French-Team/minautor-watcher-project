import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import Joi from "joi";
import logger from "./logger.js";

/**
 * Utility class for common file and system operations
 */
export class Utils {
  static fs = fs;
  /**
   * Check if a file path exists
   */
  static async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read and parse a JSON file safely
   */
  static async readJsonFile<T = any>(filePath: string): Promise<T | null> {
    try {
      if (!(await this.pathExists(filePath))) {
        logger.warn(`File not found: ${filePath}`);
        return null;
      }

      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch (error) {
      logger.error(`Error reading JSON file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Write JSON to a file with pretty formatting
   */
  static async writeJsonFile(filePath: string, data: any): Promise<boolean> {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, data, { spaces: 2 });
      logger.info(`JSON file written: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Error writing JSON file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Find files matching a pattern using glob
   */
  static async findFiles(pattern: string, cwd?: string): Promise<string[]> {
    try {
      const options = cwd ? { cwd } : {};
      return await glob(pattern, options);
    } catch (error) {
      logger.error(`Error finding files with pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Get file extension from path
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase().slice(1);
  }

  /**
   * Check if file extension is in the allowed list
   */
  static isAllowedExtension(
    filePath: string,
    allowedExtensions: string[]
  ): boolean {
    const extension = this.getFileExtension(filePath);
    return allowedExtensions.includes(extension);
  }

  /**
   * Check if path should be excluded based on patterns
   */
  static shouldExcludePath(
    filePath: string,
    excludePatterns: string[]
  ): boolean {
    const relativePath = path.relative(process.cwd(), filePath);
    return excludePatterns.some((pattern) => {
      // Support for wildcards and simple patterns
      const regexPattern = pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${regexPattern}`).test(relativePath);
    });
  }

  /**
   * Debounce function to limit the rate of function calls
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Sleep utility for delays
   */
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse a file size string (e.g. "1MB", "500KB", "2GB") to bytes
   */
  static parseFileSize(size: string | number): number {
    if (typeof size === "number") return size;

    const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
    if (!match) return parseInt(size, 10) || 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    return Math.floor(value * (multipliers[unit] || 1));
  }

  /**
   * Validate configuration object against schema
   */
  static validateConfig<T>(config: T, schema: Joi.ObjectSchema<T>): T {
    const { error, value } = schema.validate(config, { allowUnknown: true });

    if (error) {
      logger.error("Configuration validation error:", error.details);
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
    watchExtensions: Joi.array()
      .items(Joi.string())
      .default(["js", "ts", "jsx", "tsx"]),
    processingDelay: Joi.number().default(100),
  }),

  preventionRules: Joi.object({
    rules: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        enabled: Joi.boolean().default(true),
        severity: Joi.string().valid("error", "warn").default("error"),
        extensions: Joi.array().items(Joi.string()),
      })
    ),
  }),

  triggerRules: Joi.object({
    autoCorrect: Joi.object({
      enabled: Joi.boolean().default(true),
      maxFileSize: Joi.string().default("1MB"),
      timeout: Joi.number().default(30000),
    }),
    corrections: Joi.array().items(
      Joi.object({
        ruleId: Joi.string().required(),
        enabled: Joi.boolean().default(true),
        action: Joi.string().required(),
      })
    ),
  }),
};

export default Utils;
