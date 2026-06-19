import fs from "fs-extra";
import { type SpawnOptions } from "child_process";
import Joi from "joi";
/**
 * Safe execFile - runs a command with arguments without shell interpretation.
 * Returns { stdout, stderr } or throws on non-zero exit.
 */
export declare function safeExecFile(command: string, args: string[], options?: {
    cwd?: string;
    timeout?: number;
}): Promise<{
    stdout: string;
    stderr: string;
}>;
/**
 * Safe spawn - runs a command with arguments, returns stdout/stderr.
 * Does NOT use a shell - immune to injection.
 */
export declare function safeSpawn(command: string, args: string[], options?: SpawnOptions & {
    timeout?: number;
}): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
/**
 * Escape HTML special characters to prevent XSS injection.
 */
export declare function escapeHtml(str: string): string;
/**
 * Sanitize a file path - reject dangerous patterns.
 * Returns the resolved path if valid, throws if path is suspicious.
 */
export declare function sanitizePath(filePath: string): string;
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
    static readJsonFile<T = unknown>(filePath: string): Promise<T | null>;
    /**
     * Write JSON to a file with pretty formatting
     */
    static writeJsonFile(filePath: string, data: unknown): Promise<boolean>;
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
    static debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number): (...args: Parameters<T>) => void;
    /**
     * Sleep utility for delays
     */
    static sleep(ms: number): Promise<void>;
    /**
     * Parse a file size string (e.g. "1MB", "500KB", "2GB") to bytes
     */
    static parseFileSize(size: string | number): number;
    /**
     * Cached stat with TTL to reduce repeated fs.stat calls (V5.5)
     */
    private static statCache;
    private static readonly STAT_CACHE_TTL;
    static statCached(filePath: string): Promise<fs.Stats>;
    static clearStatCache(): void;
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