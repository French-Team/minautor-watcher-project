/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    metadata?: Record<string, any>;
}
/**
 * Validation error interface
 */
export interface ValidationError {
    rule: string;
    message: string;
    file: string;
    line?: number;
    column?: number;
    severity: "error" | "warning";
    code?: string;
}
/**
 * Validation warning interface
 */
export interface ValidationWarning {
    rule: string;
    message: string;
    file: string;
    line?: number;
    column?: number;
    severity?: "error" | "warning";
    suggestion?: string;
}
/**
 * Validator configuration
 */
export interface ValidatorConfig {
    enabled: boolean;
    rules: Record<string, any>;
    customRules?: Array<{
        name: string;
        pattern: RegExp;
        message: string;
        severity: "error" | "warning";
    }>;
}
/**
 * Base validator class
 */
export declare abstract class BaseValidator {
    protected config: ValidatorConfig;
    protected name: string;
    constructor(name: string, config: ValidatorConfig);
    /**
     * Validate a file
     */
    abstract validate(filePath: string): Promise<ValidationResult>;
    /**
     * Get validator name
     */
    getName(): string;
    /**
     * Check if validator is enabled
     */
    isEnabled(): boolean;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<ValidatorConfig>): void;
}
/**
 * ESLint validator for JavaScript/TypeScript files
 */
export declare class ESLintValidator extends BaseValidator {
    constructor(config: ValidatorConfig);
    validate(filePath: string): Promise<ValidationResult>;
    private checkESLintAvailability;
    private getCodeSnippet;
}
/**
 * JSON validator
 */
export declare class JSONValidator extends BaseValidator {
    constructor(config: ValidatorConfig);
    validate(filePath: string): Promise<ValidationResult>;
}
/**
 * YAML validator (if yaml package is available)
 */
export declare class YAMLValidator extends BaseValidator {
    constructor(config: ValidatorConfig);
    validate(filePath: string): Promise<ValidationResult>;
}
/**
 * Custom pattern validator
 */
export declare class PatternValidator extends BaseValidator {
    constructor(config: ValidatorConfig);
    validate(filePath: string): Promise<ValidationResult>;
}
/**
 * Validator registry and factory
 */
export declare class ValidatorRegistry {
    private validators;
    /**
     * Register a validator
     */
    register(name: string, validator: BaseValidator): void;
    /**
     * Get a validator by name
     */
    get(name: string): BaseValidator | undefined;
    /**
     * Get all registered validators
     */
    getAll(): BaseValidator[];
    /**
     * Validate a file with all applicable validators
     */
    validateFile(filePath: string): Promise<ValidationResult>;
    /**
     * Check if a validator should be applied to a file type
     */
    private shouldValidateFile;
}
/**
 * Create default validator registry with common validators
 */
export declare function createValidatorRegistry(): ValidatorRegistry;
export default BaseValidator;
//# sourceMappingURL=validators.d.ts.map