/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    metadata?: Record<string, unknown>;
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
    rules: Record<string, unknown>;
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
    private eslintAvailable;
    private eslintConfigChecked;
    private eslintConfigMissing;
    private static eslintPath;
    private static usingNpx;
    private static eslintPathByProject;
    private getEslintPath;
    /**
     * Detect the ESLint major version in the target project from its package.json.
     * Returns { major: 0, hasESLint: false } if no eslint dependency found.
     */
    private getProjectESLintVersion;
    private checkESLintAvailability;
    /**
     * Check if the target project has an ESLint configuration.
     * If missing, auto-detects TS/JS and injects a config file.
     * Called once per validator instance.
     *
     * Fixes:
     * - Searches upward for the real project root (package.json/.git/tsconfig.json)
     * - Writes template directly (bypasses injectFiles which has duplicate template bug)
     * - Writes raw JSON content (no HTML comment prefix that breaks JSON parsing)
     */
    private checkESLintConfig;
    /**
     * Find the project root by climbing directories looking for
     * package.json, .git, or tsconfig.json
     */
    private findProjectRoot;
    /**
     * Detect if a project uses TypeScript by looking for .ts/.tsx files
     */
    private detectTypescript;
    /**
     * Inject a traditional .eslintrc.json config for ESLint v8 projects.
     */
    private injectDotESLintConfig;
    /**
     * Inject an ESLint flat config (eslint.config.js) for ESLint 9+ projects.
     * These projects already have ESLint + TS plugins installed; we only
     * provide the config file with our standard rules.
     */
    private injectFlatESLintConfig;
    /**
     * Ensure required ESLint packages are installed in the target project.
     * Installs via `npm install --save-dev` in the project directory.
     */
    private ensureESLintPackages;
    private getCodeSnippet;
    /**
     * Extract code snippet from pre-read content (V5.5 optimization)
     */
    private getCodeSnippetFromContent;
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
    private static fileCache;
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
export declare function createValidatorRegistry(options?: {
    skipDefaults?: boolean;
}): ValidatorRegistry;
export default BaseValidator;
//# sourceMappingURL=validators.d.ts.map