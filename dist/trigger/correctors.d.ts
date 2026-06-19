/**
 * Restore file from backup. Returns true if restored.
 */
export declare function restoreFromBackup(filePath: string): Promise<boolean>;
/**
 * Clean up .bak files older than maxAgeMs.
 */
export declare function cleanupBackups(dir: string, maxAgeMs?: number): Promise<number>;
/**
 * Correction result
 */
export interface CorrectionResult {
    success: boolean;
    corrected: boolean;
    originalContent?: string;
    correctedContent?: string;
    changes: Array<{
        type: "insert" | "delete" | "replace";
        line: number;
        column: number;
        oldText?: string;
        newText?: string;
    }>;
    executionTime: number;
    error?: Error;
    metadata?: Record<string, unknown>;
}
/**
 * Correction rule
 */
export interface CorrectionRule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    priority: number;
    conditions: {
        fileExtensions?: string[];
        filePatterns?: string[];
        errorPatterns?: string[];
        contentPatterns?: string[];
    };
    actions: Array<{
        type: "replace" | "insert" | "delete" | "run-command" | "eslint-fix" | "prettier-format";
        target: string;
        content?: string;
        newContent?: string;
        newText?: string;
        command?: string;
        args?: string[];
    }>;
    metadata?: Record<string, unknown>;
}
/**
 * Base corrector class
 */
export declare abstract class BaseCorrector {
    protected config: CorrectionRule;
    protected name: string;
    constructor(name: string, config: CorrectionRule);
    /**
     * Check if this corrector can handle the given file and error
     */
    abstract canCorrect(filePath: string, error?: unknown): boolean;
    /**
     * Apply corrections to a file
     */
    abstract applyCorrection(filePath: string, error?: unknown, dryRun?: boolean): Promise<CorrectionResult>;
    /**
     * Apply corrections to multiple files in batch (override for true batch processing)
     */
    applyBatchCorrection(filePaths: string[], error?: unknown, dryRun?: boolean): Promise<Map<string, CorrectionResult>>;
    /**
     * Get corrector name
     */
    getName(): string;
    /**
     * Check if corrector is enabled
     */
    isEnabled(): boolean;
    /**
     * Get priority (higher = more important)
     */
    getPriority(): number;
}
/**
 * Text replacement corrector
 */
export declare class TextReplacementCorrector extends BaseCorrector {
    constructor(config: CorrectionRule);
    canCorrect(filePath: string, _error?: unknown): boolean;
    applyCorrection(filePath: string, _error?: unknown, dryRun?: boolean): Promise<CorrectionResult>;
    private applyTextReplacement;
    private applyTextInsertion;
    private applyTextDeletion;
}
/**
 * Command execution corrector
 */
export declare class CommandCorrector extends BaseCorrector {
    canCorrect(_filePath: string, _error?: unknown): boolean;
    applyCorrection(filePath: string, _error?: unknown, _dryRun?: boolean): Promise<CorrectionResult>;
    private executeCommand;
}
/**
 * ESLint auto-fix corrector
 */
export declare class ESLintFixCorrector extends BaseCorrector {
    constructor(config: CorrectionRule);
    canCorrect(filePath: string, _error?: unknown): boolean;
    applyCorrection(filePath: string, _error?: unknown, _dryRun?: boolean): Promise<CorrectionResult>;
    /**
     * Batch ESLint fix: process multiple files in a single invocation
     */
    applyBatchCorrection(filePaths: string[], _error?: unknown): Promise<Map<string, CorrectionResult>>;
}
/**
 * Prettier format corrector
 */
export declare class PrettierFormatCorrector extends BaseCorrector {
    constructor(config: CorrectionRule);
    canCorrect(filePath: string, _error?: unknown): boolean;
    applyCorrection(filePath: string, _error?: unknown, _dryRun?: boolean): Promise<CorrectionResult>;
    /**
     * Batch Prettier format: process multiple files in a single invocation
     */
    applyBatchCorrection(filePaths: string[], _error?: unknown): Promise<Map<string, CorrectionResult>>;
}
/**
 * Corrector registry and factory
 */
export declare class CorrectorRegistry {
    private correctors;
    /**
     * Register a corrector
     */
    register(name: string, corrector: BaseCorrector): void;
    /**
     * Get a corrector by name
     */
    get(name: string): BaseCorrector | undefined;
    /**
     * Get all registered correctors
     */
    getAll(): BaseCorrector[];
    /**
     * Get correctors applicable to a file
     */
    getApplicableCorrectors(filePath: string, error?: unknown): BaseCorrector[];
    /**
     * Apply corrections to a file (V5.6: parallel execution)
     */
    applyCorrections(filePath: string, error?: unknown, dryRun?: boolean): Promise<CorrectionResult[]>;
    /**
     * Apply corrections to multiple files in batch
     * Groups files by applicable corrector, then runs batch processing
     */
    applyBatchCorrections(filePaths: string[], error?: unknown): Promise<Map<string, CorrectionResult[]>>;
}
/**
 * Create default corrector registry
 */
export declare function createCorrectorRegistry(options?: {
    skipDefaults?: boolean;
}): CorrectorRegistry;
export default BaseCorrector;
//# sourceMappingURL=correctors.d.ts.map