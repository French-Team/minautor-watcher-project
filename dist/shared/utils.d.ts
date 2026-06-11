import fs from 'fs-extra';
import Joi from 'joi';
/**
 * Utility class for common file and system operations
 */
export declare class Utils {
    static fs: typeof fs;
    /**
     * Check if a file path exists
     */
    static pathExists(filePath: string): Promise<boolean>;
    /**
     * Read and parse a JSON file safely
     */
    static readJsonFile<T = any>(filePath: string): Promise<T | null>;
    /**
     * Write JSON to a file with pretty formatting
     */
    static writeJsonFile(filePath: string, data: any): Promise<boolean>;
    /**
     * Find files matching a pattern using glob
     */
    static findFiles(pattern: string, cwd?: string): Promise<string[]>;
    /**
     * Get file extension from path
     */
    static getFileExtension(filePath: string): string;
    /**
     * Check if file extension is in the allowed list
     */
    static isAllowedExtension(filePath: string, allowedExtensions: string[]): boolean;
    /**
     * Check if path should be excluded based on patterns
     */
    static shouldExcludePath(filePath: string, excludePatterns: string[]): boolean;
    /**
     * Debounce function to limit the rate of function calls
     */
    static debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
    /**
     * Sleep utility for delays
     */
    static sleep(ms: number): Promise<void>;
    /**
     * Validate configuration object against schema
     */
    static validateConfig<T>(config: T, schema: Joi.ObjectSchema<T>): T;
}
/**
 * Configuration schemas for validation
 */
export declare const ConfigSchemas: {
    watcherConfig: Joi.ObjectSchema<any>;
    preventionRules: Joi.ObjectSchema<any>;
    triggerRules: Joi.ObjectSchema<any>;
};
export default Utils;
//# sourceMappingURL=utils.d.ts.map