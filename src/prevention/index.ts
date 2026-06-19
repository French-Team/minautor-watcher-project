import {
  ValidatorRegistry,
  PatternValidator,
  ValidatorConfig,
  createValidatorRegistry,
} from "./validators.js";
import { ScriptRunner, ScriptConfig, createScriptRunner } from "./scripts.js";
import {
  PreventionConfigManager,
  PreventionRule,
  createPreventionConfig,
} from "./config.js";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("prevention");

/**
 * Prevention result for a file
 */
export interface PreventionResult {
  filePath: string;
  success: boolean;
  errors: Array<{
    rule: string;
    message: string;
    severity: "error" | "warning" | "info";
  }>;
  warnings: Array<{
    rule: string;
    message: string;
    severity: "error" | "warning" | "info";
  }>;
  executionTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * Prevention module configuration
 */
export interface PreventionModuleConfig {
  configPath?: string;
  enabled?: boolean;
  failOnError?: boolean;
  failOnWarning?: boolean;
  maxExecutionTime?: number;
  parallelExecution?: boolean;
}

/**
 * Main prevention module that orchestrates validation and script execution
 */
export class PreventionModule {
  private configManager!: PreventionConfigManager;
  private validatorRegistry: ValidatorRegistry;
  private scriptRunner: ScriptRunner;
  private config: PreventionModuleConfig;
  private isRunning: boolean = false;

  private constructor(
    config: PreventionModuleConfig,
    dependencies?: {
      validatorRegistry?: ValidatorRegistry;
      scriptRunner?: ScriptRunner;
      configManager?: PreventionConfigManager;
    }
  ) {
    this.config = {
      enabled: true,
      failOnError: true,
      failOnWarning: false,
      maxExecutionTime: 10000,
      parallelExecution: true,
      ...config,
    };

    this.validatorRegistry =
      dependencies?.validatorRegistry || createValidatorRegistry();
    this.scriptRunner = dependencies?.scriptRunner || createScriptRunner();
  }

  /**
   * Create and initialize a PreventionModule (async factory)
   */
  static async create(
    config: PreventionModuleConfig = {},
    dependencies?: {
      validatorRegistry?: ValidatorRegistry;
      scriptRunner?: ScriptRunner;
      configManager?: PreventionConfigManager;
    }
  ): Promise<PreventionModule> {
    const module = new PreventionModule(config, dependencies);
    module.configManager =
      dependencies?.configManager ||
      (await createPreventionConfig(config.configPath));
    return module;
  }

  /**
   * Start the prevention module
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Prevention module is already running");
      return;
    }

    try {
      logger.info("Starting prevention module...");

      // Update component configurations
      await this.updateComponentConfigurations();

      this.isRunning = true;
      logger.success("Prevention module started successfully");
    } catch (error) {
      logger.error("Failed to start prevention module:", error);
      throw error;
    }
  }

  /**
   * Stop the prevention module
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("Prevention module is not running");
      return;
    }

    try {
      logger.info("Stopping prevention module...");

      // Stop all running scripts
      this.scriptRunner.stopAllScripts();

      this.isRunning = false;
      logger.success("Prevention module stopped successfully");
    } catch (error) {
      logger.error("Failed to stop prevention module:", error);
      throw error;
    }
  }

  /**
   * Process a file through all applicable prevention rules
   */
  async processFile(filePath: string): Promise<PreventionResult> {
    if (!this.isRunning || !this.config.enabled) {
      return {
        filePath,
        success: true,
        errors: [],
        warnings: [],
        executionTime: 0,
      };
    }

    const startTime = Date.now();
    const result: PreventionResult = {
      filePath,
      success: true,
      errors: [],
      warnings: [],
      executionTime: 0,
    };

    try {
      logger.info(`Processing file: ${filePath}`);

      // Get applicable rules for this file
      const applicableRules = await this.configManager.getRulesForFile(
        filePath
      );

      if (applicableRules.length === 0) {
        logger.debug(`No prevention rules applicable for file: ${filePath}`);
        result.executionTime = Date.now() - startTime;
        return result;
      }

      logger.info(
        `Applying ${applicableRules.length} prevention rules to ${filePath}`
      );

      // Process each rule
      for (const rule of applicableRules) {
        try {
          const ruleResult = await this.processRule(filePath, rule);
          result.errors.push(...ruleResult.errors);
          result.warnings.push(...ruleResult.warnings);

          if (ruleResult.errors.length > 0 && this.config.failOnError) {
            result.success = false;
          }

          if (ruleResult.warnings.length > 0 && this.config.failOnWarning) {
            result.success = false;
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error(
            `Error processing rule ${rule.id} for ${filePath}:`,
            error
          );
          result.errors.push({
            rule: rule.id,
            message: `Rule processing failed: ${error.message}`,
            severity: "error",
          });
          result.success = false;
        }
      }

      // Execute applicable scripts
      try {
        const scriptResults = await this.scriptRunner.executeScriptsForFile(
          filePath
        );
        for (const scriptResult of scriptResults) {
          if (!scriptResult.success) {
            if (scriptResult.toolErrors && scriptResult.toolErrors.length > 0) {
              // Tool not found (ENOENT) — distinguish from actual lint errors
              for (const te of scriptResult.toolErrors) {
                result.errors.push({
                  rule: `tool-missing:${te.tool}`,
                  message: te.message,
                  severity: "error",
                });
              }
            } else {
              result.errors.push({
                rule: scriptResult.error?.message || "script-failed",
                message: `Script execution failed: ${scriptResult.stderr}`,
                severity: "error",
              });
            }
            result.success = false;
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`Error executing scripts for ${filePath}:`, error);
        result.errors.push({
          rule: "script-execution",
          message: `Script execution error: ${error.message}`,
          severity: "error",
        });
        result.success = false;
      }

      result.executionTime = Date.now() - startTime;

      logger.info(
        `Prevention processing completed for ${filePath}: ${
          result.success ? "SUCCESS" : "FAILED"
        } ` +
          `(${result.errors.length} errors, ${result.warnings.length} warnings) in ${result.executionTime}ms`
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Error in prevention processing for ${filePath}:`, error);
      result.success = false;
      result.errors.push({
        rule: "prevention-error",
        message: `Prevention processing failed: ${error.message}`,
        severity: "error",
      });
      result.executionTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Process a single rule for a file
   */
  private async processRule(
    filePath: string,
    rule: PreventionRule
  ): Promise<{
    errors: Array<{
      rule: string;
      message: string;
      severity: "error" | "warning" | "info";
    }>;
    warnings: Array<{
      rule: string;
      message: string;
      severity: "error" | "warning" | "info";
    }>;
  }> {
    const errors: Array<{
      rule: string;
      message: string;
      severity: "error" | "warning" | "info";
    }> = [];
    const warnings: Array<{
      rule: string;
      message: string;
      severity: "error" | "warning" | "info";
    }> = [];

    // Run validators
    for (const validatorName of rule.validators) {
      const validator = this.validatorRegistry.get(validatorName);
      if (validator && validator.isEnabled()) {
        try {
          const validationResult = await validator.validate(filePath);

          for (const err of validationResult.errors) {
            errors.push({
              rule: `${rule.id}:${err.rule}`,
              message: err.message,
              severity: err.severity || "error",
            });
          }

          for (const warning of validationResult.warnings) {
            warnings.push({
              rule: `${rule.id}:${warning.rule}`,
              message: warning.message,
              severity: warning.severity || "warning",
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error(
            `Validator ${validatorName} failed for rule ${rule.id}:`,
            error
          );
          errors.push({
            rule: `${rule.id}:${validatorName}`,
            message: `Validator failed: ${error.message}`,
            severity: "error",
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Update component configurations based on current settings
   */
  private async updateComponentConfigurations(): Promise<void> {
    const config = this.configManager.getConfig();

    // Update script runner with custom scripts
    if (config.customScripts) {
      for (const customScript of config.customScripts) {
        this.scriptRunner.addScript(
          customScript.config as unknown as ScriptConfig
        );
      }
    }

    // Update validator registry with custom validators
    if (config.customValidators) {
      for (const customValidator of config.customValidators) {
        const validator = new PatternValidator({
          enabled: true,
          rules: {},
          customRules:
            (customValidator.config
              ?.customRules as ValidatorConfig["customRules"]) ?? [],
        });
        this.validatorRegistry.register(customValidator.name, validator);
        logger.success(`Custom validator registered: ${customValidator.name}`);
      }
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    enabled: boolean;
    ruleCount: number;
    enabledRuleCount: number;
    validatorCount: number;
    scriptCount: number;
    configStats: {
      totalRules: number;
      enabledRules: number;
      rulesByCategory: Record<string, number>;
      rulesBySeverity: Record<string, number>;
    };
  } {
    const configStats = this.configManager.getStats();

    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled ?? true,
      ruleCount: configStats.totalRules,
      enabledRuleCount: configStats.enabledRules,
      validatorCount: this.validatorRegistry.getAll().length,
      scriptCount: this.scriptRunner.getScripts().length,
      configStats,
    };
  }

  /**
   * Reload configuration
   */
  async reloadConfig(): Promise<void> {
    await this.configManager.reloadConfig();
    await this.updateComponentConfigurations();
    logger.success("Configuration reloaded");
  }

  /**
   * Add a custom rule
   */
  async addRule(rule: PreventionRule): Promise<void> {
    await this.configManager.addRule(rule);
    await this.updateComponentConfigurations();
  }

  /**
   * Remove a rule
   */
  async removeRule(ruleId: string): Promise<boolean> {
    const removed = await this.configManager.removeRule(ruleId);
    if (removed) {
      await this.updateComponentConfigurations();
    }
    return removed;
  }

  /**
   * Toggle a rule
   */
  async toggleRule(ruleId: string, enabled: boolean): Promise<boolean> {
    const toggled = await this.configManager.toggleRule(ruleId, enabled);
    if (toggled) {
      await this.updateComponentConfigurations();
    }
    return toggled;
  }
}

/**
 * Factory function to create a prevention module (async)
 */
export async function createPreventionModule(
  config?: PreventionModuleConfig,
  dependencies?: {
    validatorRegistry?: ValidatorRegistry;
    scriptRunner?: ScriptRunner;
    configManager?: PreventionConfigManager;
  }
): Promise<PreventionModule> {
  return PreventionModule.create(config, dependencies);
}

/**
 * Quick setup function for common use cases
 */
export async function setupPrevention(
  config?: PreventionModuleConfig
): Promise<PreventionModule> {
  const module = await createPreventionModule(config);
  await module.start();
  return module;
}

export default PreventionModule;
