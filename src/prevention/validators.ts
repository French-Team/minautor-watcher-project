import fs from "fs-extra";
import path from "path";
import { Utils, safeSpawn } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";
import { injectFiles, getEslintTemplate } from "../injection/index.js";

const logger = createChildLogger("prevention-validators");

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

    // Skip if ESLint was already checked and unavailable
    if (this.eslintAvailable === false) {
      return result;
    }

    try {
      // Check if ESLint is available
      await this.checkESLintAvailability();

      // Check if the target project has an ESLint config
      if (!(await this.checkESLintConfig(filePath))) {
        return result;
      }

      // Run ESLint on the file
      const { stdout, stderr, exitCode } = await safeSpawn("npx", [
        "eslint",
        filePath,
        "--format=json",
      ]);

      if (stderr) {
        logger.warn(`ESLint stderr for ${filePath}:`, stderr);
      }

      // Handle empty stdout or non-zero exit without JSON output
      if (!stdout || stdout.trim() === "") {
        if (exitCode !== 0) {
          logger.warn(
            `ESLint returned no output for ${filePath} (exit code ${exitCode})`
          );
        }
        return result;
      }

      // Parse ESLint output
      let eslintResults: Array<{
        messages: Array<{
          ruleId: string | null;
          message: string;
          line: number;
          column: number;
          severity: number;
          suggestions?: Array<{ desc: string; fix: unknown }>;
        }>;
      }>;
      try {
        eslintResults = JSON.parse(stdout);
      } catch (parseError) {
        logger.warn(
          `ESLint output not valid JSON for ${filePath}:`,
          stdout.substring(0, 200)
        );
        return result;
      }

      for (const fileResult of eslintResults) {
        for (const message of fileResult.messages) {
          const validationMessage: ValidationError = {
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
          } else {
            result.warnings.push({
              rule: validationMessage.rule,
              message: validationMessage.message,
              file: validationMessage.file,
              line: validationMessage.line,
              column: validationMessage.column,
              suggestion: message.suggestions?.[0]?.desc,
            });
          }
        }
      }

      logger.debug(
        `ESLint validation completed for ${filePath}: ${result.errors.length} errors, ${result.warnings.length} warnings`
      );
    } catch (error: unknown) {
      const errorCode =
        error instanceof Error && "code" in error
          ? (error as { code: string }).code
          : undefined;
      if (errorCode === "ENOENT") {
        // npx not found — cache and skip future calls
        this.eslintAvailable = false;
        logger.warn(
          "ESLint not found (npx ENOENT), skipping validation for all files"
        );
        return result;
      } else {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // ESLint not available is expected — log as warn, not error
        if (errorMessage.includes("ESLint is not available")) {
          logger.warn(
            `ESLint validation skipped for ${filePath}: ${errorMessage}`
          );
        } else {
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

  private eslintAvailable: boolean | null = null;
  private eslintConfigChecked = false;
  private eslintConfigMissing = false;

  private async checkESLintAvailability(): Promise<void> {
    if (this.eslintAvailable !== null) return;

    try {
      await safeSpawn("npx", ["eslint", "--version"]);
      this.eslintAvailable = true;
    } catch (error) {
      this.eslintAvailable = false;
      throw new Error(
        "ESLint is not available. Please install it: npm install -g eslint"
      );
    }
  }

  /**
   * Check if the target project has an ESLint configuration.
   * If missing, auto-detects TS/JS and injects a config file.
   * Called once per validator instance.
   */
  private async checkESLintConfig(filePath: string): Promise<boolean> {
    if (this.eslintConfigChecked) return !this.eslintConfigMissing;
    this.eslintConfigChecked = true;

    const projectDir = path.dirname(filePath);
    const configFiles = [
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.mjs",
      ".eslintrc.json",
      ".eslintrc.yaml",
      ".eslintrc.yml",
    ];

    // Check for config files
    for (const file of configFiles) {
      if (await fs.pathExists(path.join(projectDir, file))) {
        return true;
      }
    }

    // Check for eslintConfig in package.json
    const packageJsonPath = path.join(projectDir, "package.json");
    if (await fs.pathExists(packageJsonPath)) {
      try {
        const pkg = await fs.readJson(packageJsonPath);
        if (pkg.eslintConfig) return true;
      } catch {
        // ignore parse errors
      }
    }

    // Check flat config (eslint.config.js / eslint.config.mjs / eslint.config.cjs)
    const flatConfigs = [
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
    ];
    for (const file of flatConfigs) {
      if (await fs.pathExists(path.join(projectDir, file))) {
        return true;
      }
    }

    // No config found — inject one
    logger.info(`ESLint config not found in ${projectDir}, injecting...`);

    // Auto-detect TypeScript vs JavaScript
    const isTypescript = await this.detectTypescript(projectDir);
    const template = getEslintTemplate(isTypescript);

    const results = await injectFiles({
      projectDir,
      agents: ["eslint"],
      config: {
        enabled: true,
        templates: ["eslint"],
        autoInject: false,
        autoUpdate: false,
        forceOverwrite: false,
        projectPatterns: [],
      },
      force: true,
    });

    const injected = results.find((r) => r.agent === "eslint");
    if (
      injected &&
      (injected.action === "created" || injected.action === "updated")
    ) {
      logger.success(
        `ESLint config injected: ${template.fileName} (${
          isTypescript ? "TypeScript" : "JavaScript"
        })`
      );
      return true;
    }

    logger.error(
      `Failed to inject ESLint config in ${projectDir}: ${
        injected?.reason || "unknown error"
      }`
    );
    this.eslintConfigMissing = true;
    return false;
  }

  /**
   * Detect if a project uses TypeScript by looking for .ts/.tsx files
   */
  private async detectTypescript(projectDir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(projectDir);
      for (const entry of entries) {
        if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
          return true;
        }
      }
      // Also check src/ subdirectory
      const srcDir = path.join(projectDir, "src");
      if (await fs.pathExists(srcDir)) {
        const srcEntries = await fs.readdir(srcDir);
        for (const entry of srcEntries) {
          if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
            return true;
          }
        }
      }
    } catch {
      // ignore errors
    }
    return false;
  }

  private async getCodeSnippet(
    filePath: string,
    lineNumber?: number
  ): Promise<string | undefined> {
    if (!lineNumber) return undefined;

    try {
      const content = await fs.readFile(filePath, "utf-8");
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
      const yamlModule = "yaml";
      const yaml: { parse: (input: string) => unknown } | null = await (
        import(yamlModule) as Promise<{
          parse: (input: string) => unknown;
        } | null>
      ).catch(() => null);

      if (!yaml) {
        logger.debug("YAML package not available, skipping YAML validation");
        return result;
      }

      const content = await fs.readFile(filePath, "utf-8");
      yaml.parse(content);

      logger.debug(`YAML validation passed for ${filePath}`);
    } catch (error: unknown) {
      const errorCode =
        error instanceof Error && "code" in error
          ? (error as { code: string }).code
          : undefined;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorCode === "MODULE_NOT_FOUND") {
        logger.debug("YAML package not available, skipping YAML validation");
      } else {
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
    logger.success(`Validator registered: ${name}`);
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
export function createValidatorRegistry(options?: {
  skipDefaults?: boolean;
}): ValidatorRegistry {
  const registry = new ValidatorRegistry();

  if (options?.skipDefaults) {
    return registry;
  }

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
