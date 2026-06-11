/**
 * Correction result
 */
export interface CorrectionResult {
    success: boolean;
    corrected: boolean;
    originalContent?: string;
    correctedContent?: string;
    changes: Array<{
        type: 'insert' | 'delete' | 'replace';
        line: number;
        column: number;
        oldText?: string;
        newText?: string;
    }>;
    executionTime: number;
    error?: Error;
    metadata?: Record<string, any>;
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
        type: 'replace' | 'insert' | 'delete' | 'run-command' | 'eslint-fix' | 'prettier-format';
        target: string;
        content?: string;
        newContent?: string;
        newText?: string;
        command?: string;
        args?: string[];
    }>;
    metadata?: Record<string, any>;
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
    abstract canCorrect(filePath: string, error?: any): boolean;
    /**
     * Apply corrections to a file
     */
    abstract applyCorrection(filePath: string, error?: any): Promise<CorrectionResult>;
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
    canCorrect(filePath: string, error?: any): boolean;
    applyCorrection(filePath: string, error?: any): Promise<CorrectionResult>;
    private applyTextReplacement;
    private applyTextInsertion;
    private applyTextDeletion;
}
/**
 * Command execution corrector
 */
export declare class CommandCorrector extends BaseCorrector {
    canCorrect(filePath: string, error?: any): boolean;
    applyCorrection(filePath: string, error?: any): Promise<CorrectionResult>;
    private executeCommand;
}
/**
 * ESLint auto-fix corrector
 */
export declare class ESLintFixCorrector extends BaseCorrector {
    constructor(config: CorrectionRule);
    canCorrect(filePath: string, error?: any): boolean;
    applyCorrection(filePath: string, error?: any): Promise<CorrectionResult>;
}
/**
 * Prettier format corrector
 */
export declare class PrettierFormatCorrector extends BaseCorrector {
    constructor(config: CorrectionRule);
    canCorrect(filePath: string, error?: any): boolean;
    applyCorrection(filePath: string, error?: any): Promise<CorrectionResult>;
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
    getApplicableCorrectors(filePath: string, error?: any): BaseCorrector[];
    /**
     * Apply corrections to a file
     */
    applyCorrections(filePath: string, error?: any): Promise<CorrectionResult[]>;
}
/**
 * Create default corrector registry
 */
export declare function createCorrectorRegistry(): CorrectorRegistry;
export default BaseCorrector;
//# sourceMappingURL=correctors.d.ts.map