import fs from "fs-extra";
import { exec } from "child_process";
import { promisify } from "util";
import { Utils } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";

const execAsync = promisify(exec);
const logger = createChildLogger("prevention-validators");

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
export abstract class BaseValidator {
  protected config: ValidatorConfig;
  protected name: string;

  constructor(name: string, config: ValidatorConfig) {
    this.name = name;
    this.config = config;
  }

  /**
   * Validate a file
   */
  abstract validate(filePath: string): Promise<ValidationResult>;

  /**
   * Get validator name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if validator is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * ESLint validator for JavaScript/TypeScript files
 */
export class ESLintValidator extends BaseValidator {
  constructor(config: ValidatorConfig) {
    super("eslint", config);
  }

  async validate(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!this.isEnabled()) {
      return result;
    }

    try {
      // Check if ESLint is available
      await this.checkESLintAvailability();

      // Run ESLint on the file
      const { stdout, stderr } = await execAsync(
        `npx eslint "${filePath}" --format=json`
      );

      if (stderr) {
        logger.warn(`ESLint stderr for ${filePath}:`, stderr);
      }

      // Parse ESLint output
      const eslintResults = JSON.parse(stdout);

      for (const fileResult of eslintResults) {
        for (const message of fileResult.messages) {
          const validationMessage: ValidationError = {
            rule: message.ruleId || "unknown",
            message: message.message,
            file: filePath,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? "error" : "warning",
            code: this.getCodeSnippet(filePath, message.line),
          };

          if (message.severity === 2) {
            result.errors.push(validationMessage);
            result.isValid = false;
          } else {
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

      logger.debug(
        `ESLint validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`
      );
    } catch (error: any) {
      if (error.code === "ENOENT") {
        logger.warn("ESLint not found, skipping validation");
        result.warnings.push({
          rule: "eslint-not-found",
          message: "ESLint is not installed or not in PATH",
          file: filePath,
          suggestion: "Install ESLint: npm install -g eslint",
        });
      } else {
        logger.error(`ESLint validation failed for ${filePath}:`, error);
        result.errors.push({
          rule: "eslint-error",
          message: `ESLint execution failed: ${error.message}`,
          file: filePath,
          severity: "error",
        });
        result.isValid = false;
      }
    }

    return result;
  }

  private async checkESLintAvailability(): Promise<void> {
    try {
      await execAsync("npx eslint --version");
    } catch (error) {
      throw new Error(
        "ESLint is not available. Please install it: npm install -g eslint"
      );
    }
  }

  private getCodeSnippet(
    filePath: string,
    lineNumber?: number
  ): string | undefined {
    if (!lineNumber) return undefined;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      if (lineNumber <= lines.length) {
        return lines[lineNumber - 1].trim();
      }
    } catch (error) {
      logger.warn(`Could not read code snippet for ${filePath}:${lineNumber}`);
    }

    return undefined;
  }
}

/**
 * JSON validator
 */
export class JSONValidator extends BaseValidator {
  constructor(config: ValidatorConfig) {
    super("json", config);
  }

  async validate(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
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
    } catch (error: any) {
      result.isValid = false;
      result.errors.push({
        rule: "json-syntax",
        message: `Invalid JSON: ${error.message}`,
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
  constructor(config: ValidatorConfig) {
    super("yaml", config);
  }

  async validate(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!this.isEnabled()) {
      return result;
    }

    try {
      // Check if yaml package is available
      // @ts-expect-error - yaml is optional, handled gracefully at runtime
      const yaml: any = await import("yaml").catch(() => null);

      if (!yaml) {
        logger.debug("YAML package not available, skipping YAML validation");
        return result;
      }

      const content = await fs.readFile(filePath, "utf-8");
      yaml.parse(content);

      logger.debug(`YAML validation passed for ${filePath}`);
    } catch (error: any) {
      if (error.code === "MODULE_NOT_FOUND") {
        logger.debug("YAML package not available, skipping YAML validation");
      } else {
        result.isValid = false;
        result.errors.push({
          rule: "yaml-syntax",
          message: `Invalid YAML: ${error.message}`,
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
  constructor(config: ValidatorConfig) {
    super("pattern", config);
  }

  async validate(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
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

        for (const rule of this.config.customRules!) {
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
            } else {
              result.warnings.push(message);
            }
          }
        }
      }

      logger.debug(
        `Pattern validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`
      );
    } catch (err) {
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
  private validators: Map<string, BaseValidator> = new Map();

  /**
   * Register a validator
   */
  register(name: string, validator: BaseValidator): void {
    this.validators.set(name, validator);
    logger.info(`Validator registered: ${name}`);
  }

  /**
   * Get a validator by name
   */
  get(name: string): BaseValidator | undefined {
    return this.validators.get(name);
  }

  /**
   * Get all registered validators
   */
  getAll(): BaseValidator[] {
    return Array.from(this.validators.values());
  }

  /**
   * Validate a file with all applicable validators
   */
  async validateFile(filePath: string): Promise<ValidationResult> {
    const extension = Utils.getFileExtension(filePath);
    const result: ValidationResult = {
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
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error(
            `Validator ${validator.getName()} failed for ${filePath}:`,
            error
          );
          result.errors.push({
            rule: "validator-error",
            message: `Validator ${validator.getName()} failed: ${
              error.message
            }`,
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
  private shouldValidateFile(
    validatorName: string,
    extension: string
  ): boolean {
    const validatorsByExtension: Record<string, string[]> = {
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
export function createValidatorRegistry(): ValidatorRegistry {
  const registry = new ValidatorRegistry();

  // Register default validators
  registry.register(
    "eslint",
    new ESLintValidator({
      enabled: true,
      rules: {},
    })
  );

  registry.register(
    "json",
    new JSONValidator({
      enabled: true,
      rules: {},
    })
  );

  registry.register(
    "yaml",
    new YAMLValidator({
      enabled: true,
      rules: {},
    })
  );

  registry.register(
    "pattern",
    new PatternValidator({
      enabled: true,
      rules: {},
      customRules: [
        {
          name: "console-log",
          pattern: /console\.log\(/,
          message: "Avoid console.log in production code",
          severity: "warning" as const,
        },
        {
          name: "todo-comment",
          pattern: /(TODO|FIXME|XXX)/i,
          message: "TODO comment found",
          severity: "warning" as const,
        },
      ],
    })
  );

  return registry;
}

export default BaseValidator;
