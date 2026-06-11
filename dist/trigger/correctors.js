import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Utils } from '../shared/utils.js';
import { createChildLogger } from '../shared/logger.js';
const execAsync = promisify(exec);
const logger = createChildLogger('trigger-correctors');
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
    canCorrect(filePath, error) {
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
            const matchesPattern = this.config.conditions.filePatterns.some(pattern => fileName.includes(pattern));
            if (!matchesPattern) {
                return false;
            }
        }
        return true;
    }
    async applyCorrection(filePath, error) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            logger.info(`Applying text replacement corrections to ${filePath}`);
            // Read original content
            const originalContent = await fs.readFile(filePath, 'utf-8');
            result.originalContent = originalContent;
            let correctedContent = originalContent;
            let hasChanges = false;
            // Apply each action
            for (const action of this.config.actions) {
                if (action.type === 'replace') {
                    const changes = this.applyTextReplacement(correctedContent, action);
                    if (changes.modified) {
                        correctedContent = changes.content;
                        hasChanges = true;
                        result.changes.push(...changes.details);
                    }
                }
                else if (action.type === 'insert') {
                    const changes = this.applyTextInsertion(correctedContent, action);
                    if (changes.modified) {
                        correctedContent = changes.content;
                        hasChanges = true;
                        result.changes.push(...changes.details);
                    }
                }
                else if (action.type === 'delete') {
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
                await fs.writeFile(filePath, correctedContent);
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
        if (action.target === 'all') {
            // Replace all occurrences
            const regex = new RegExp(action.content, 'g');
            const newContent = content.replace(regex, action.newContent || '');
            if (newContent !== content) {
                // Calculate approximate line/column for the change
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(action.content)) {
                        details.push({
                            type: 'replace',
                            line: i + 1,
                            column: lines[i].indexOf(action.content) + 1,
                            oldText: action.content,
                            newText: action.newText || '',
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
        // TODO: Implement line-specific replacements
        return { modified: false, content, details };
    }
    applyTextInsertion(content, action) {
        // TODO: Implement text insertion
        return { modified: false, content, details: [] };
    }
    applyTextDeletion(content, action) {
        // TODO: Implement text deletion
        return { modified: false, content, details: [] };
    }
}
/**
 * Command execution corrector
 */
export class CommandCorrector extends BaseCorrector {
    canCorrect(filePath, error) {
        if (!this.isEnabled())
            return false;
        // Check if any action is a command execution
        return this.config.actions.some(action => action.type === 'run-command');
    }
    async applyCorrection(filePath, error) {
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
                if (action.type === 'run-command') {
                    const commandResult = await this.executeCommand(action, filePath);
                    if (commandResult.success) {
                        result.corrected = true;
                        result.changes.push({
                            type: 'replace',
                            line: 0,
                            column: 0,
                            oldText: 'file-content',
                            newText: 'corrected-by-command',
                        });
                        logger.info(`Command correction successful: ${action.command}`);
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
            logger.debug(`Executing command: ${command} ${args.join(' ')} in ${cwd}`);
            const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, { cwd });
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
    canCorrect(filePath, error) {
        if (!this.isEnabled())
            return false;
        const extension = Utils.getFileExtension(filePath);
        return ['js', 'ts', 'jsx', 'tsx'].includes(extension);
    }
    async applyCorrection(filePath, error) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            logger.info(`Running ESLint auto-fix on ${filePath}`);
            const { stdout, stderr } = await execAsync(`npx eslint --fix "${filePath}"`);
            result.corrected = !stderr || !stderr.includes('error');
            result.success = true;
            if (stderr) {
                logger.warn(`ESLint stderr: ${stderr}`);
            }
            if (stdout) {
                logger.debug(`ESLint output: ${stdout}`);
            }
            // Read the corrected content
            if (result.corrected) {
                result.correctedContent = await fs.readFile(filePath, 'utf-8');
            }
        }
        catch (error) {
            logger.error(`ESLint auto-fix failed for ${filePath}:`, error);
            result.error = error instanceof Error ? error : new Error(String(error));
        }
        result.executionTime = Date.now() - startTime;
        return result;
    }
}
/**
 * Prettier format corrector
 */
export class PrettierFormatCorrector extends BaseCorrector {
    constructor(config) {
        super(config.id, config);
    }
    canCorrect(filePath, error) {
        if (!this.isEnabled())
            return false;
        const extension = Utils.getFileExtension(filePath);
        return ['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'css', 'scss'].includes(extension);
    }
    async applyCorrection(filePath, error) {
        const startTime = Date.now();
        const result = {
            success: false,
            corrected: false,
            changes: [],
            executionTime: 0,
        };
        try {
            logger.info(`Running Prettier format on ${filePath}`);
            const { stdout, stderr } = await execAsync(`npx prettier --write "${filePath}"`);
            result.corrected = true;
            result.success = true;
            if (stderr) {
                logger.warn(`Prettier stderr: ${stderr}`);
            }
            if (stdout) {
                logger.debug(`Prettier output: ${stdout}`);
            }
            // Read the formatted content
            result.correctedContent = await fs.readFile(filePath, 'utf-8');
        }
        catch (error) {
            logger.error(`Prettier format failed for ${filePath}:`, error);
            result.error = error instanceof Error ? error : new Error(String(error));
        }
        result.executionTime = Date.now() - startTime;
        return result;
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
        logger.info(`Corrector registered: ${name}`);
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
            .filter(corrector => corrector.canCorrect(filePath, error))
            .sort((a, b) => b.getPriority() - a.getPriority()); // Sort by priority (highest first)
    }
    /**
     * Apply corrections to a file
     */
    async applyCorrections(filePath, error) {
        const applicableCorrectors = this.getApplicableCorrectors(filePath, error);
        const results = [];
        logger.info(`Applying ${applicableCorrectors.length} correctors to ${filePath}`);
        for (const corrector of applicableCorrectors) {
            try {
                const result = await corrector.applyCorrection(filePath, error);
                results.push(result);
                if (result.corrected) {
                    logger.info(`Corrector ${corrector.getName()} successfully corrected ${filePath}`);
                }
            }
            catch (error) {
                logger.error(`Corrector ${corrector.getName()} failed for ${filePath}:`, error);
                results.push({
                    success: false,
                    corrected: false,
                    changes: [],
                    executionTime: 0,
                    error: error instanceof Error ? error : new Error(String(error)),
                });
            }
        }
        return results;
    }
}
/**
 * Create default corrector registry
 */
export function createCorrectorRegistry() {
    const registry = new CorrectorRegistry();
    // Register default correctors
    registry.register('eslint-fix', new ESLintFixCorrector({
        id: 'eslint-fix',
        name: 'ESLint Auto Fix',
        description: 'Automatically fix ESLint errors',
        enabled: true,
        priority: 10,
        conditions: {
            fileExtensions: ['js', 'ts', 'jsx', 'tsx'],
        },
        actions: [],
    }));
    registry.register('prettier-format', new PrettierFormatCorrector({
        id: 'prettier-format',
        name: 'Prettier Format',
        description: 'Format code with Prettier',
        enabled: true,
        priority: 5,
        conditions: {
            fileExtensions: ['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'css', 'scss'],
        },
        actions: [],
    }));
    // Text replacement corrector for common patterns
    registry.register('text-replacement', new TextReplacementCorrector({
        id: 'text-replacement',
        name: 'Text Replacement',
        description: 'Apply text-based corrections',
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [
            {
                type: 'replace',
                target: 'all',
                content: 'console.log(',
                newText: 'logger.info(',
            },
        ],
    }));
    return registry;
}
export default BaseCorrector;
//# sourceMappingURL=correctors.js.map