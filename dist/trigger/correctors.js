import fs from "fs-extra";
import path from "path";
import { Utils, safeSpawn } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("trigger-correctors");
/**
 * File lock map to serialize corrections per file.
 * Prevents concurrent writes from ESLint and Prettier on the same file.
 */
const fileLocks = new Map();
const LOCK_TTL_MS = 30_000;
/**
 * Execute a function while holding a file lock.
 * Serializes writes to the same file to prevent race conditions.
 * Auto-releases after 30s if holder crashes.
 */
async function withFileLock(filePath, fn) {
    // Wait for any pending lock on this file
    const prev = fileLocks.get(filePath);
    if (prev) {
        await prev;
    }
    // Create a new promise for this lock
    let release;
    const current = new Promise((resolve) => {
        release = resolve;
    });
    fileLocks.set(filePath, current);
    // Safety TTL: auto-release if holder hangs
    const timer = setTimeout(() => {
        if (fileLocks.get(filePath) === current) {
            release();
            fileLocks.delete(filePath);
        }
    }, LOCK_TTL_MS);
    timer.unref();
    try {
        return await fn();
    }
    finally {
        clearTimeout(timer);
        release();
        // Clean up if we're still the holder
        if (fileLocks.get(filePath) === current) {
            fileLocks.delete(filePath);
        }
    }
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Write file content with automatic backup.
 * If backup is true, creates a .bak file before writing.
 * Returns the backup path if created.
 */
async function writeFileWithBackup(filePath, content, backup = true) {
    if (!backup) {
        await fs.writeFile(filePath, content);
        return null;
    }
    const backupPath = filePath + ".bak";
    if (await fs.pathExists(filePath)) {
        await fs.copy(filePath, backupPath);
    }
    await fs.writeFile(filePath, content);
    return backupPath;
}
/**
 * Restore file from backup. Returns true if restored.
 */
export async function restoreFromBackup(filePath) {
    const backupPath = filePath + ".bak";
    if (await fs.pathExists(backupPath)) {
        await fs.move(backupPath, filePath, { overwrite: true });
        logger.info(`Restored ${filePath} from backup`);
        return true;
    }
    return false;
}
/**
 * Clean up .bak files older than maxAgeMs.
 */
export async function cleanupBackups(dir, maxAgeMs = 24 * 60 * 60 * 1000) {
    let cleaned = 0;
    try {
        const files = await fs.readdir(dir);
        for (const file of files) {
            if (!file.endsWith(".bak"))
                continue;
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            if (Date.now() - stat.mtimeMs > maxAgeMs) {
                await fs.remove(filePath);
                cleaned++;
            }
        }
    }
    catch {
        // ignore errors during cleanup
    }
    return cleaned;
}
/**
 * Base corrector class
 */
export class BaseCorrector {
    config;
    name;
    constructor(name, config) {
        this.name = name;
        this.config = config;
    }
    /**
     * Apply corrections to multiple files in batch (override for true batch processing)
     */
    async applyBatchCorrection(filePaths, error, dryRun) {
        const results = new Map();
        for (const filePath of filePaths) {
            results.set(filePath, await this.applyCorrection(filePath, error, dryRun));
        }
        return results;
    }
    /**
     * Get corrector name
     */
    getName() {
        return this.name;
    }
    /**
     * Check if corrector is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Get priority (higher = more important)
     */
    getPriority() {
        return this.config.priority;
    }
}
/**
 * Text replacement corrector
 */
export class TextReplacementCorrector extends BaseCorrector {
    constructor(config) {
        super(config.id, config);
    }
    canCorrect(filePath, _error) {
        if (!this.isEnabled())
            return false;
        const extension = Utils.getFileExtension(filePath);
        // Check file extension condition
        if (this.config.conditions.fileExtensions) {
            if (!this.config.conditions.fileExtensions.includes(extension)) {
                return false;
            }
        }
        // Check file pattern condition
        if (this.config.conditions.filePatterns) {
            const fileName = path.basename(filePath);
            const matchesPattern = this.config.conditions.filePatterns.some((pattern) => fileName.includes(pattern));
            if (!matchesPattern) {
                return false;
            }
        }
        return true;
    }
    async applyCorrection(filePath, _error, dryRun = false) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            if (!this.isEnabled()) {
                logger.debug(`Corrector ${this.name} is disabled, skipping`);
                result.success = true;
                return result;
            }
            logger.info(`Applying text replacement corrections to ${filePath}`);
            // Read original content
            const originalContent = await fs.readFile(filePath, "utf-8");
            result.originalContent = originalContent;
            let correctedContent = originalContent;
            let hasChanges = false;
            // Apply each action
            for (const action of this.config.actions) {
                if (action.type === "replace") {
                    const changes = this.applyTextReplacement(correctedContent, action);
                    if (changes.modified) {
                        correctedContent = changes.content;
                        hasChanges = true;
                        result.changes.push(...changes.details);
                    }
                }
                else if (action.type === "insert") {
                    const changes = this.applyTextInsertion(correctedContent, action);
                    if (changes.modified) {
                        correctedContent = changes.content;
                        hasChanges = true;
                        result.changes.push(...changes.details);
                    }
                }
                else if (action.type === "delete") {
                    const changes = this.applyTextDeletion(correctedContent, action);
                    if (changes.modified) {
                        correctedContent = changes.content;
                        hasChanges = true;
                        result.changes.push(...changes.details);
                    }
                }
            }
            // Write corrected content if there were changes
            if (hasChanges && correctedContent !== originalContent) {
                if (!dryRun) {
                    await writeFileWithBackup(filePath, correctedContent);
                }
                result.corrected = true;
                result.correctedContent = correctedContent;
                logger.info(`Applied ${result.changes.length} corrections to ${filePath}`);
            }
            else {
                logger.debug(`No corrections needed for ${filePath}`);
            }
            result.success = true;
        }
        catch (error) {
            logger.error(`Error applying text replacement corrections to ${filePath}:`, error);
            result.error = error instanceof Error ? error : new Error(String(error));
        }
        result.executionTime = Date.now() - startTime;
        return result;
    }
    applyTextReplacement(content, action) {
        const details = [];
        if (action.target === "all") {
            // Replace all occurrences
            const searchContent = action.content ?? "";
            const regex = new RegExp(escapeRegex(searchContent), "g");
            const newContent = content.replace(regex, action.newContent || "");
            if (newContent !== content) {
                // Calculate approximate line/column for the change
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(searchContent)) {
                        details.push({
                            type: "replace",
                            line: i + 1,
                            column: lines[i].indexOf(searchContent) + 1,
                            oldText: searchContent,
                            newText: action.newContent || "",
                        });
                    }
                }
            }
            return {
                modified: newContent !== content,
                content: newContent,
                details,
            };
        }
        return { modified: false, content, details };
    }
    applyTextInsertion(content, action) {
        const details = [];
        const lines = content.split("\n");
        let targetLine = action.target;
        if (targetLine === "end") {
            targetLine = lines.length;
        }
        if (typeof targetLine === "number" &&
            targetLine >= 0 &&
            targetLine <= lines.length) {
            const insertContent = action.content || "";
            lines.splice(targetLine, 0, insertContent);
            details.push({
                type: "insert",
                line: targetLine,
                column: 0,
                newText: insertContent,
            });
        }
        return {
            modified: details.length > 0,
            content: lines.join("\n"),
            details,
        };
    }
    applyTextDeletion(content, action) {
        const details = [];
        const lines = content.split("\n");
        if (action.target === "all" && action.content) {
            const searchStr = action.content;
            const escaped = escapeRegex(searchStr);
            const regex = new RegExp(escaped, "g");
            let match;
            while ((match = regex.exec(content)) !== null) {
                const lineNum = content.substring(0, match.index).split("\n").length;
                details.push({
                    type: "delete",
                    line: lineNum,
                    column: match.index,
                    oldText: match[0],
                });
            }
            return {
                modified: details.length > 0,
                content: content.replace(regex, ""),
                details,
            };
        }
        if (typeof action.target === "number" &&
            action.target >= 0 &&
            action.target < lines.length) {
            const deletedLine = lines.splice(action.target, 1)[0];
            details.push({
                type: "delete",
                line: action.target,
                column: 0,
                oldText: deletedLine,
            });
        }
        return {
            modified: details.length > 0,
            content: lines.join("\n"),
            details,
        };
    }
}
/**
 * Command execution corrector
 */
export class CommandCorrector extends BaseCorrector {
    canCorrect(_filePath, _error) {
        if (!this.isEnabled())
            return false;
        // Check if any action is a command execution
        return this.config.actions.some((action) => action.type === "run-command");
    }
    async applyCorrection(filePath, _error, _dryRun = false) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            logger.info(`Executing command corrections for ${filePath}`);
            // Execute each command action
            for (const action of this.config.actions) {
                if (action.type === "run-command") {
                    const commandResult = await this.executeCommand(action, filePath);
                    if (commandResult.success) {
                        result.corrected = true;
                        result.changes.push({
                            type: "replace",
                            line: 0,
                            column: 0,
                            oldText: "file-content",
                            newText: "corrected-by-command",
                        });
                        logger.success(`Command correction successful: ${action.command}`);
                    }
                    else {
                        logger.error(`Command correction failed: ${action.command} - ${commandResult.error}`);
                        result.error = commandResult.error;
                        break;
                    }
                }
            }
            result.success = result.error === undefined;
        }
        catch (error) {
            logger.error(`Error applying command corrections to ${filePath}:`, error);
            result.error = error instanceof Error ? error : new Error(String(error));
        }
        result.executionTime = Date.now() - startTime;
        return result;
    }
    async executeCommand(action, filePath) {
        try {
            const command = action.command;
            const args = action.args || [];
            const cwd = path.dirname(filePath);
            if (!command) {
                return { success: false, error: new Error("No command specified") };
            }
            logger.debug(`Executing command: ${command} ${args.join(" ")} in ${cwd}`);
            const { stderr } = await safeSpawn(command, args, { cwd });
            if (stderr) {
                logger.warn(`Command stderr: ${stderr}`);
            }
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
}
/**
 * ESLint auto-fix corrector
 */
export class ESLintFixCorrector extends BaseCorrector {
    constructor(config) {
        super(config.id, config);
    }
    canCorrect(filePath, _error) {
        if (!this.isEnabled())
            return false;
        const extension = Utils.getFileExtension(filePath);
        return ["js", "ts", "jsx", "tsx"].includes(extension);
    }
    async applyCorrection(filePath, _error, _dryRun = false) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            logger.info(`Running ESLint auto-fix on ${filePath}`);
            // Serialize writes to prevent concurrent ESLint + Prettier conflicts
            await withFileLock(filePath, async () => {
                const { stderr } = await safeSpawn("npx", [
                    "eslint",
                    "--fix",
                    filePath,
                ], { cwd: path.dirname(filePath) });
                result.corrected = !stderr || !stderr.includes("error");
                result.success = true;
                if (stderr) {
                    logger.warn(`ESLint stderr: ${stderr}`);
                }
                // Read the corrected content
                if (result.corrected) {
                    result.correctedContent = await fs.readFile(filePath, "utf-8");
                }
            });
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            if (errorCode === "ENOENT") {
                logger.warn(`ESLint auto-fix skipped for ${filePath}: npx not found in PATH`);
            }
            else {
                logger.error(`ESLint auto-fix failed for ${filePath}:`, error);
            }
            result.error = error instanceof Error ? error : new Error(String(error));
        }
        result.executionTime = Date.now() - startTime;
        return result;
    }
    /**
     * Batch ESLint fix: process multiple files in a single invocation
     */
    async applyBatchCorrection(filePaths, _error) {
        const results = new Map();
        const startTime = Date.now();
        if (filePaths.length === 0)
            return results;
        if (filePaths.length === 1) {
            results.set(filePaths[0], await this.applyCorrection(filePaths[0], _error));
            return results;
        }
        try {
            logger.info(`Running ESLint batch fix on ${filePaths.length} files`);
            const BATCH_SIZE = 50;
            for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
                const batch = filePaths.slice(i, i + BATCH_SIZE);
                const batchCwd = path.dirname(batch[0]);
                const { stderr } = await safeSpawn("npx", [
                    "eslint",
                    "--fix",
                    ...batch,
                ], { cwd: batchCwd });
                const hasError = stderr && stderr.includes("error");
                for (const filePath of batch) {
                    const result = {
                        success: true,
                        corrected: !hasError,
                        changes: [],
                        executionTime: Date.now() - startTime,
                    };
                    if (result.corrected) {
                        try {
                            result.correctedContent = await fs.readFile(filePath, "utf-8");
                        }
                        catch {
                            result.correctedContent = undefined;
                        }
                    }
                    results.set(filePath, result);
                }
                if (stderr) {
                    logger.warn(`ESLint batch stderr: ${stderr}`);
                }
            }
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            if (errorCode === "ENOENT") {
                logger.warn("ESLint batch fix skipped: npx not found in PATH");
            }
            else {
                logger.error(`ESLint batch fix failed:`, error);
            }
            const err = error instanceof Error ? error : new Error(String(error));
            for (const filePath of filePaths) {
                if (!results.has(filePath)) {
                    results.set(filePath, {
                        success: false,
                        corrected: false,
                        changes: [],
                        executionTime: Date.now() - startTime,
                        error: err,
                    });
                }
            }
        }
        return results;
    }
}
/**
 * Prettier format corrector
 */
export class PrettierFormatCorrector extends BaseCorrector {
    constructor(config) {
        super(config.id, config);
    }
    canCorrect(filePath, _error) {
        if (!this.isEnabled())
            return false;
        const extension = Utils.getFileExtension(filePath);
        return ["js", "ts", "jsx", "tsx", "json", "md", "css", "scss"].includes(extension);
    }
    async applyCorrection(filePath, _error, _dryRun = false) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            logger.info(`Running Prettier format on ${filePath}`);
            // Serialize writes to prevent concurrent ESLint + Prettier conflicts
            await withFileLock(filePath, async () => {
                const { stderr } = await safeSpawn("npx", [
                    "prettier",
                    "--write",
                    filePath,
                ], { cwd: path.dirname(filePath) });
                result.corrected = true;
                result.success = true;
                if (stderr) {
                    logger.warn(`Prettier stderr: ${stderr}`);
                }
                // Read the formatted content
                result.correctedContent = await fs.readFile(filePath, "utf-8");
            });
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            if (errorCode === "ENOENT") {
                logger.warn(`Prettier format skipped for ${filePath}: npx not found in PATH`);
            }
            else {
                logger.error(`Prettier format failed for ${filePath}:`, error);
            }
            result.error = error instanceof Error ? error : new Error(String(error));
        }
        result.executionTime = Date.now() - startTime;
        return result;
    }
    /**
     * Batch Prettier format: process multiple files in a single invocation
     */
    async applyBatchCorrection(filePaths, _error) {
        const results = new Map();
        const startTime = Date.now();
        if (filePaths.length === 0)
            return results;
        if (filePaths.length === 1) {
            results.set(filePaths[0], await this.applyCorrection(filePaths[0], _error));
            return results;
        }
        try {
            logger.info(`Running Prettier batch format on ${filePaths.length} files`);
            const BATCH_SIZE = 50;
            for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
                const batch = filePaths.slice(i, i + BATCH_SIZE);
                const batchCwd = path.dirname(batch[0]);
                await safeSpawn("npx", ["prettier", "--write", ...batch], { cwd: batchCwd });
                for (const filePath of batch) {
                    const result = {
                        success: true,
                        corrected: true,
                        changes: [],
                        executionTime: Date.now() - startTime,
                    };
                    try {
                        result.correctedContent = await fs.readFile(filePath, "utf-8");
                    }
                    catch {
                        result.correctedContent = undefined;
                    }
                    results.set(filePath, result);
                }
            }
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            if (errorCode === "ENOENT") {
                logger.warn("Prettier format skipped: npx not found in PATH");
            }
            else {
                logger.error(`Prettier batch format failed:`, error);
            }
            const err = error instanceof Error ? error : new Error(String(error));
            for (const filePath of filePaths) {
                if (!results.has(filePath)) {
                    results.set(filePath, {
                        success: false,
                        corrected: false,
                        changes: [],
                        executionTime: Date.now() - startTime,
                        error: err,
                    });
                }
            }
        }
        return results;
    }
}
/**
 * Corrector registry and factory
 */
export class CorrectorRegistry {
    correctors = new Map();
    /**
     * Register a corrector
     */
    register(name, corrector) {
        this.correctors.set(name, corrector);
        logger.success(`Corrector registered: ${name}`);
    }
    /**
     * Get a corrector by name
     */
    get(name) {
        return this.correctors.get(name);
    }
    /**
     * Get all registered correctors
     */
    getAll() {
        return Array.from(this.correctors.values());
    }
    /**
     * Get correctors applicable to a file
     */
    getApplicableCorrectors(filePath, error) {
        return this.getAll()
            .filter((corrector) => corrector.canCorrect(filePath, error))
            .sort((a, b) => b.getPriority() - a.getPriority()); // Sort by priority (highest first)
    }
    /**
     * Apply corrections to a file (V5.6: parallel execution)
     */
    async applyCorrections(filePath, error, dryRun = false) {
        const applicableCorrectors = this.getApplicableCorrectors(filePath, error);
        logger.info(`Applying ${applicableCorrectors.length} correctors to ${filePath}${dryRun ? " (dry-run)" : ""}`);
        const results = await Promise.allSettled(applicableCorrectors.map(async (corrector) => {
            try {
                const result = await corrector.applyCorrection(filePath, error, dryRun);
                if (result.corrected) {
                    logger.info(`Corrector ${corrector.getName()} successfully corrected ${filePath}`);
                }
                return result;
            }
            catch (error) {
                logger.error(`Corrector ${corrector.getName()} failed for ${filePath}:`, error);
                return {
                    success: false,
                    corrected: false,
                    changes: [],
                    executionTime: 0,
                    error: error instanceof Error ? error : new Error(String(error)),
                };
            }
        }));
        return results.map((result) => result.status === "fulfilled"
            ? result.value
            : {
                success: false,
                corrected: false,
                changes: [],
                executionTime: 0,
                error: result.reason,
            });
    }
    /**
     * Apply corrections to multiple files in batch
     * Groups files by applicable corrector, then runs batch processing
     */
    async applyBatchCorrections(filePaths, error) {
        const allResults = new Map();
        if (filePaths.length === 0)
            return allResults;
        for (const filePath of filePaths) {
            allResults.set(filePath, []);
        }
        const correctorFileMap = new Map();
        for (const filePath of filePaths) {
            const applicable = this.getApplicableCorrectors(filePath, error);
            for (const corrector of applicable) {
                const name = corrector.getName();
                if (!correctorFileMap.has(name)) {
                    correctorFileMap.set(name, []);
                }
                correctorFileMap.get(name).push(filePath);
            }
        }
        for (const [correctorName, files] of correctorFileMap) {
            const corrector = this.correctors.get(correctorName);
            if (!corrector)
                continue;
            logger.info(`Batch applying ${correctorName} to ${files.length} files`);
            try {
                const batchResults = await corrector.applyBatchCorrection(files, error);
                for (const [filePath, result] of batchResults) {
                    const existing = allResults.get(filePath) || [];
                    existing.push(result);
                    allResults.set(filePath, existing);
                    if (result.corrected) {
                        logger.info(`Corrector ${correctorName} successfully corrected ${filePath}`);
                    }
                }
            }
            catch (err) {
                logger.error(`Corrector ${correctorName} batch failed:`, err);
                const errorResult = {
                    success: false,
                    corrected: false,
                    changes: [],
                    executionTime: 0,
                    error: err instanceof Error ? err : new Error(String(err)),
                };
                for (const filePath of files) {
                    const existing = allResults.get(filePath) || [];
                    existing.push(errorResult);
                    allResults.set(filePath, existing);
                }
            }
        }
        return allResults;
    }
}
/**
 * Create default corrector registry
 */
export function createCorrectorRegistry(options) {
    const registry = new CorrectorRegistry();
    if (options?.skipDefaults) {
        return registry;
    }
    // Register default correctors
    registry.register("eslint-fix", new ESLintFixCorrector({
        id: "eslint-fix",
        name: "ESLint Auto Fix",
        description: "Automatically fix ESLint errors",
        enabled: true,
        priority: 10,
        conditions: {
            fileExtensions: ["js", "ts", "jsx", "tsx"],
        },
        actions: [],
    }));
    registry.register("prettier-format", new PrettierFormatCorrector({
        id: "prettier-format",
        name: "Prettier Format",
        description: "Format code with Prettier",
        enabled: true,
        priority: 5,
        conditions: {
            fileExtensions: ["js", "ts", "jsx", "tsx", "json", "md", "css", "scss"],
        },
        actions: [],
    }));
    // Text replacement corrector for common patterns
    registry.register("text-replacement", new TextReplacementCorrector({
        id: "text-replacement",
        name: "Text Replacement",
        description: "Apply text-based corrections",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [],
    }));
    return registry;
}
export default BaseCorrector;
//# sourceMappingURL=correctors.js.map