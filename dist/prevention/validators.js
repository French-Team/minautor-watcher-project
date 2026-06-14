import fs from "fs-extra";
import { Utils, safeSpawn } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("prevention-validators");
/**
 * Base validator class
 */
export class BaseValidator {
    config;
    name;
    constructor(name, config) {
        this.name = name;
        this.config = config;
    }
    /**
     * Get validator name
     */
    getName() {
        return this.name;
    }
    /**
     * Check if validator is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
/**
 * ESLint validator for JavaScript/TypeScript files
 */
export class ESLintValidator extends BaseValidator {
    constructor(config) {
        super("eslint", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled()) {
            return result;
        }
        // Skip if ESLint was already checked and unavailable
        if (this.eslintAvailable === false) {
            return result;
        }
        try {
            // Check if ESLint is available
            await this.checkESLintAvailability();
            // Run ESLint on the file
            const { stdout, stderr } = await safeSpawn("npx", [
                "eslint",
                filePath,
                "--format=json",
            ]);
            if (stderr) {
                logger.warn(`ESLint stderr for ${filePath}:`, stderr);
            }
            // Parse ESLint output
            const eslintResults = JSON.parse(stdout);
            for (const fileResult of eslintResults) {
                for (const message of fileResult.messages) {
                    const validationMessage = {
                        rule: message.ruleId || "unknown",
                        message: message.message,
                        file: filePath,
                        line: message.line,
                        column: message.column,
                        severity: message.severity === 2 ? "error" : "warning",
                        code: await this.getCodeSnippet(filePath, message.line),
                    };
                    if (message.severity === 2) {
                        result.errors.push(validationMessage);
                        result.isValid = false;
                    }
                    else {
                        result.warnings.push({
                            rule: validationMessage.rule,
                            message: validationMessage.message,
                            file: validationMessage.file,
                            line: validationMessage.line,
                            column: validationMessage.column,
                            suggestion: message.suggestions?.[0],
                        });
                    }
                }
            }
            logger.debug(`ESLint validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`);
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            if (errorCode === "ENOENT") {
                // npx not found — cache and skip future calls
                this.eslintAvailable = false;
                logger.warn("ESLint not found (npx ENOENT), skipping validation for all files");
                return result;
            }
            else {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // ESLint not available is expected — log as warn, not error
                if (errorMessage.includes("ESLint is not available")) {
                    logger.warn(`ESLint validation skipped for ${filePath}: ${errorMessage}`);
                }
                else {
                    logger.error(`ESLint validation failed for ${filePath}:`, error);
                    result.errors.push({
                        rule: "eslint-error",
                        message: `ESLint execution failed: ${errorMessage}`,
                        file: filePath,
                        severity: "error",
                    });
                    result.isValid = false;
                }
            }
        }
        return result;
    }
    eslintAvailable = null;
    async checkESLintAvailability() {
        if (this.eslintAvailable !== null)
            return;
        try {
            await safeSpawn("npx", ["eslint", "--version"]);
            this.eslintAvailable = true;
        }
        catch (error) {
            this.eslintAvailable = false;
            throw new Error("ESLint is not available. Please install it: npm install -g eslint");
        }
    }
    async getCodeSnippet(filePath, lineNumber) {
        if (!lineNumber)
            return undefined;
        try {
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");
            if (lineNumber <= lines.length) {
                return lines[lineNumber - 1].trim();
            }
        }
        catch (error) {
            logger.warn(`Could not read code snippet for ${filePath}:${lineNumber}`);
        }
        return undefined;
    }
}
/**
 * JSON validator
 */
export class JSONValidator extends BaseValidator {
    constructor(config) {
        super("json", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled()) {
            return result;
        }
        try {
            const content = await fs.readFile(filePath, "utf-8");
            // Basic JSON syntax validation
            JSON.parse(content);
            logger.debug(`JSON validation passed for ${filePath}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.isValid = false;
            result.errors.push({
                rule: "json-syntax",
                message: `Invalid JSON: ${errorMessage}`,
                file: filePath,
                severity: "error",
            });
        }
        return result;
    }
}
/**
 * YAML validator (if yaml package is available)
 */
export class YAMLValidator extends BaseValidator {
    constructor(config) {
        super("yaml", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled()) {
            return result;
        }
        try {
            // Check if yaml package is available
            const yamlModule = "yaml";
            const yaml = await import(yamlModule).catch(() => null);
            if (!yaml) {
                logger.debug("YAML package not available, skipping YAML validation");
                return result;
            }
            const content = await fs.readFile(filePath, "utf-8");
            yaml.parse(content);
            logger.debug(`YAML validation passed for ${filePath}`);
        }
        catch (error) {
            const errorCode = error instanceof Error && "code" in error
                ? error.code
                : undefined;
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorCode === "MODULE_NOT_FOUND") {
                logger.debug("YAML package not available, skipping YAML validation");
            }
            else {
                result.isValid = false;
                result.errors.push({
                    rule: "yaml-syntax",
                    message: `Invalid YAML: ${errorMessage}`,
                    file: filePath,
                    severity: "error",
                });
            }
        }
        return result;
    }
}
/**
 * Custom pattern validator
 */
export class PatternValidator extends BaseValidator {
    constructor(config) {
        super("pattern", config);
    }
    async validate(filePath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        if (!this.isEnabled() || !this.config.customRules) {
            return result;
        }
        try {
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const rule of this.config.customRules) {
                    if (rule.pattern.test(line)) {
                        const message = {
                            rule: rule.name,
                            message: rule.message,
                            file: filePath,
                            line: i + 1,
                            column: line.indexOf(line.match(rule.pattern)?.[0] || "") + 1,
                            severity: rule.severity,
                        };
                        if (rule.severity === "error") {
                            result.errors.push(message);
                            result.isValid = false;
                        }
                        else {
                            result.warnings.push(message);
                        }
                    }
                }
            }
            logger.debug(`Pattern validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error(`Pattern validation failed for ${filePath}:`, error);
            result.errors.push({
                rule: "pattern-error",
                message: `Pattern validation failed: ${error.message}`,
                file: filePath,
                severity: "error",
            });
            result.isValid = false;
        }
        return result;
    }
}
/**
 * Validator registry and factory
 */
export class ValidatorRegistry {
    validators = new Map();
    /**
     * Register a validator
     */
    register(name, validator) {
        this.validators.set(name, validator);
        logger.success(`Validator registered: ${name}`);
    }
    /**
     * Get a validator by name
     */
    get(name) {
        return this.validators.get(name);
    }
    /**
     * Get all registered validators
     */
    getAll() {
        return Array.from(this.validators.values());
    }
    /**
     * Validate a file with all applicable validators
     */
    async validateFile(filePath) {
        const extension = Utils.getFileExtension(filePath);
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
        };
        for (const validator of this.validators.values()) {
            if (!validator.isEnabled()) {
                continue;
            }
            // Check if validator applies to this file type
            if (this.shouldValidateFile(validator.getName(), extension)) {
                try {
                    const validatorResult = await validator.validate(filePath);
                    result.errors.push(...validatorResult.errors);
                    result.warnings.push(...validatorResult.warnings);
                    if (!validatorResult.isValid) {
                        result.isValid = false;
                    }
                    result.metadata = {
                        ...result.metadata,
                        [validator.getName()]: {
                            isValid: validatorResult.isValid,
                            errorCount: validatorResult.errors.length,
                            warningCount: validatorResult.warnings.length,
                        },
                    };
                }
                catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    logger.error(`Validator ${validator.getName()} failed for ${filePath}:`, error);
                    result.errors.push({
                        rule: "validator-error",
                        message: `Validator ${validator.getName()} failed: ${error.message}`,
                        file: filePath,
                        severity: "error",
                    });
                    result.isValid = false;
                }
            }
        }
        return result;
    }
    /**
     * Check if a validator should be applied to a file type
     */
    shouldValidateFile(validatorName, extension) {
        const validatorsByExtension = {
            js: ["eslint", "pattern"],
            jsx: ["eslint", "pattern"],
            ts: ["eslint", "pattern"],
            tsx: ["eslint", "pattern"],
            json: ["json"],
            yaml: ["yaml"],
            yml: ["yaml"],
            md: ["pattern"],
        };
        return validatorsByExtension[extension]?.includes(validatorName) || false;
    }
}
/**
 * Create default validator registry with common validators
 */
export function createValidatorRegistry(options) {
    const registry = new ValidatorRegistry();
    if (options?.skipDefaults) {
        return registry;
    }
    // Register default validators
    registry.register("eslint", new ESLintValidator({
        enabled: true,
        rules: {},
    }));
    registry.register("json", new JSONValidator({
        enabled: true,
        rules: {},
    }));
    registry.register("yaml", new YAMLValidator({
        enabled: true,
        rules: {},
    }));
    registry.register("pattern", new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
            {
                name: "console-log",
                pattern: /console\.log\(/,
                message: "Avoid console.log in production code",
                severity: "warning",
            },
            {
                name: "todo-comment",
                pattern: /(TODO|FIXME|XXX)/i,
                message: "TODO comment found",
                severity: "warning",
            },
        ],
    }));
    return registry;
}
export default BaseValidator;
//# sourceMappingURL=validators.js.map