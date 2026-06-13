import fs from "fs-extra";
import path from "path";
import Joi from "joi";
import { Utils } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("trigger-rules");

export interface TriggerRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: {
    eventTypes?: string[];
    fileExtensions?: string[];
    filePatterns?: string[];
    errorPatterns?: string[];
    severity?: "error" | "warning" | "info";
    metadataConditions?: Record<string, unknown>;
  };
  actions: Array<{
    type: "correct" | "notify" | "log" | "skip" | "custom";
    target?: string;
    config?: Record<string, unknown>;
    delay?: number;
  }>;
  cooldown?: {
    enabled: boolean;
    period: number;
  };
  metadata?: Record<string, unknown>;
}

export interface TriggerContext {
  filePath: string;
  eventType: string;
  error?: Error | { message: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface TriggerResult {
  ruleId: string;
  success: boolean;
  actions: Array<{
    type: string;
    success: boolean;
    result?: string | unknown[] | Record<string, unknown>;
    error?: Error;
  }>;
  executionTime: number;
  skipped?: boolean;
  cooldown?: boolean;
  error?: Error;
}

interface LegacyCorrection {
  ruleId?: string;
  description?: string;
  enabled?: boolean;
  extensions?: string[];
  action?: string;
  pattern?: string;
  replacement?: string;
}

interface LegacyCondition {
  name?: string;
  action?: string;
}

interface LegacyNotifications {
  onFailure?: boolean;
  channels?: string[];
  throttle?: number;
}

interface LegacyAutoCorrect {
  maxFileSize?: string | number;
}

interface LegacyConfig extends Record<string, unknown> {
  corrections?: LegacyCorrection[];
  conditions?: LegacyCondition[];
  notifications?: LegacyNotifications;
  autoCorrect?: LegacyAutoCorrect;
}

export class TriggerRuleManager {
  private rules: TriggerRule[] = [];
  private configPath: string;
  private configSchema: Joi.ObjectSchema;
  private cooldowns: Map<string, number> = new Map();

  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(process.cwd(), "config", "trigger-rules.json");

    this.configSchema = Joi.object({
      rules: Joi.array()
        .items(
          Joi.object({
            id: Joi.string().required(),
            name: Joi.string().required(),
            description: Joi.string().required(),
            enabled: Joi.boolean().default(true),
            priority: Joi.number().default(0),
            conditions: Joi.object({
              eventTypes: Joi.array().items(Joi.string()),
              fileExtensions: Joi.array().items(Joi.string()),
              filePatterns: Joi.array().items(Joi.string()),
              errorPatterns: Joi.array().items(Joi.string()),
              severity: Joi.string().valid("error", "warning", "info"),
              metadataConditions: Joi.object().default({}),
            }).default(),
            actions: Joi.array()
              .items(
                Joi.object({
                  type: Joi.string()
                    .valid("correct", "notify", "log", "skip", "custom")
                    .required(),
                  target: Joi.string(),
                  config: Joi.object().default({}),
                  delay: Joi.number().default(0),
                })
              )
              .default([]),
            cooldown: Joi.object({
              enabled: Joi.boolean().default(false),
              period: Joi.number().default(60000),
            }).default(),
          })
        )
        .default([]),
    });

    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.pathExistsSync(this.configPath)) {
        const raw = fs.readJsonSync(this.configPath);

        if (raw.rules) {
          const { error, value } = this.configSchema.validate(raw, {
            allowUnknown: true,
          });
          if (error) {
            logger.warn(
              `Configuration validation error: ${error.message}. Using defaults.`
            );
          } else {
            this.rules = value.rules || [];
            logger.info(
              `Loaded ${this.rules.length} trigger rules from configuration`
            );
            return;
          }
        } else if (raw.corrections) {
          const rules = this.convertLegacyConfig(raw);
          const { error, value } = this.configSchema.validate(
            { rules },
            { allowUnknown: true }
          );
          if (error) {
            logger.warn(
              `Converted legacy config validation error: ${error.message}. Using defaults.`
            );
          } else {
            this.rules = value.rules || [];
            logger.info(
              `Converted and loaded ${this.rules.length} trigger rules from legacy configuration`
            );
            return;
          }
        }
      }
    } catch (error) {
      logger.error("Error loading trigger rules configuration:", error);
    }

    logger.info("Using default trigger rules");
    this.loadDefaultRules();
  }

  private convertLegacyConfig(raw: Record<string, unknown>): TriggerRule[] {
    const rules: TriggerRule[] = [];
    const legacyRaw = raw as LegacyConfig;
    const corrections: LegacyCorrection[] = legacyRaw.corrections || [];
    const conditions: LegacyCondition[] = legacyRaw.conditions || [];
    const notifications: LegacyNotifications = legacyRaw.notifications || {};
    const autoCorrect: LegacyAutoCorrect = legacyRaw.autoCorrect || {};

    const conditionMap = new Map<string, LegacyCondition>();
    for (const cond of conditions) {
      if (cond.name) {
        conditionMap.set(cond.name, cond);
      }
    }

    for (const corr of corrections) {
      const rule: TriggerRule = {
        id: corr.ruleId || "unknown",
        name: corr.description || corr.ruleId || "unnamed",
        description: corr.description || "",
        enabled: corr.enabled !== false,
        priority: 1,
        conditions: {},
        actions: [],
      };

      if (corr.extensions) {
        rule.conditions.fileExtensions = corr.extensions;
      }

      switch (corr.action) {
        case "remove":
          rule.actions.push({
            type: "correct",
            target: "text-replacement",
            config: {
              type: "delete",
              target: "all",
              content: corr.pattern || "",
            },
          });
          break;
        case "replace":
          rule.actions.push({
            type: "correct",
            target: "text-replacement",
            config: {
              type: "replace",
              target: "all",
              content: corr.pattern || "",
              newText: corr.replacement || "",
            },
          });
          break;
        case "merge":
          rule.actions.push({
            type: "custom",
            config: {
              handler: "merge-duplicate-imports",
            },
          });
          break;
        case "run-eslint-fix":
          rule.actions.push({
            type: "correct",
            target: "eslint-fix",
            delay: 100,
          });
          break;
        case "run-prettier":
          rule.actions.push({
            type: "correct",
            target: "prettier-format",
            delay: 50,
          });
          break;
        default:
          rule.actions.push({
            type: "correct",
            target: "text-replacement",
            config: {
              type: "replace",
              target: "all",
              content: corr.pattern || "",
              newText: corr.replacement || "",
            },
          });
      }

      if (notifications.onFailure !== false) {
        const notifyAction: {
          type: "notify";
          target: string;
          config: Record<string, unknown>;
        } = {
          type: "notify",
          target: "slack,email",
          config: { level: "warning" },
        };
        if (Array.isArray(notifications.channels)) {
          notifyAction.target = notifications.channels.join(",");
        }
        if (notifications.throttle) {
          rule.cooldown = { enabled: true, period: notifications.throttle };
        }
        rule.actions.push(notifyAction);
      }

      for (const cond of conditions) {
        if (cond.name === "file-too-large" && cond.action === "skip") {
          rule.actions.unshift({
            type: "skip",
            config: { maxFileSize: autoCorrect.maxFileSize || "1MB" },
          });
        }
      }

      rules.push(rule);
    }

    return rules;
  }

  private loadDefaultRules(): void {
    this.rules = [
      {
        id: "auto-correct-eslint",
        name: "Auto-correct ESLint errors",
        description:
          "Automatically fix ESLint errors in JavaScript/TypeScript files",
        enabled: true,
        priority: 10,
        conditions: {
          eventTypes: ["fileModified"],
          fileExtensions: ["js", "ts", "jsx", "tsx"],
          errorPatterns: ["eslint"],
        },
        actions: [
          {
            type: "correct",
            target: "eslint-fix",
            delay: 100,
          },
        ],
      },
      {
        id: "format-with-prettier",
        name: "Format with Prettier",
        description: "Format supported files with Prettier",
        enabled: true,
        priority: 5,
        conditions: {
          eventTypes: ["fileModified"],
          fileExtensions: [
            "js",
            "ts",
            "jsx",
            "tsx",
            "json",
            "md",
            "css",
            "scss",
          ],
        },
        actions: [
          {
            type: "correct",
            target: "prettier-format",
            delay: 50,
          },
        ],
      },
      {
        id: "notify-on-correction-failure",
        name: "Notify on correction failure",
        description: "Send notification when automatic corrections fail",
        enabled: true,
        priority: 1,
        conditions: {
          eventTypes: ["correctionFailed"],
          severity: "error",
        },
        actions: [
          {
            type: "notify",
            target: "slack,email",
            config: {
              level: "error",
            },
          },
        ],
      },
      {
        id: "log-file-changes",
        name: "Log file changes",
        description: "Log all file changes for audit purposes",
        enabled: true,
        priority: 0,
        conditions: {
          eventTypes: ["fileModified", "fileAdded", "fileDeleted"],
        },
        actions: [
          {
            type: "log",
            config: {
              level: "info",
            },
          },
        ],
      },
      {
        id: "skip-large-files",
        name: "Skip large files",
        description:
          "Skip processing very large files to avoid performance issues",
        enabled: true,
        priority: 100,
        conditions: {
          eventTypes: ["fileModified"],
        },
        actions: [
          {
            type: "skip",
            config: {
              maxFileSize: 5 * 1024 * 1024,
            },
          },
        ],
      },
    ];
    logger.info(`Loaded ${this.rules.length} default trigger rules`);
  }

  getRules(): TriggerRule[] {
    return [...this.rules];
  }

  getEnabledRules(): TriggerRule[] {
    return this.rules.filter((rule) => rule.enabled);
  }

  getApplicableRules(context: TriggerContext): TriggerRule[] {
    const enabledRules = this.getEnabledRules();
    return enabledRules
      .filter((rule) => this.ruleMatchesContext(rule, context))
      .sort((a, b) => b.priority - a.priority);
  }

  private ruleMatchesContext(
    rule: TriggerRule,
    context: TriggerContext
  ): boolean {
    if (rule.conditions.eventTypes) {
      if (!rule.conditions.eventTypes.includes(context.eventType)) {
        return false;
      }
    }

    if (rule.conditions.fileExtensions) {
      const extension = Utils.getFileExtension(context.filePath);
      if (!rule.conditions.fileExtensions.includes(extension)) {
        return false;
      }
    }

    if (rule.conditions.filePatterns) {
      const fileName = path.basename(context.filePath);
      const matchesPattern = rule.conditions.filePatterns.some(
        (pattern) =>
          fileName.includes(pattern) || context.filePath.includes(pattern)
      );
      if (!matchesPattern) {
        return false;
      }
    }

    if (rule.conditions.errorPatterns && context.error) {
      const errorMessage = context.error.message || String(context.error);
      const matchesErrorPattern = rule.conditions.errorPatterns.some(
        (pattern) => errorMessage.includes(pattern)
      );
      if (!matchesErrorPattern) {
        return false;
      }
    }

    if (rule.conditions.severity && context.metadata?.severity) {
      if (rule.conditions.severity !== context.metadata.severity) {
        return false;
      }
    }

    if (rule.conditions.metadataConditions) {
      for (const [key, value] of Object.entries(
        rule.conditions.metadataConditions
      )) {
        if (context.metadata?.[key] !== value) {
          return false;
        }
      }
    }

    if (rule.cooldown?.enabled) {
      const lastExecution = this.cooldowns.get(rule.id) || 0;
      const now = Date.now();
      const cooldownPeriod = rule.cooldown.period;
      if (now - lastExecution < cooldownPeriod) {
        return false;
      }
    }

    return true;
  }

  async addRule(rule: TriggerRule): Promise<void> {
    const existingIndex = this.rules.findIndex((r) => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }

    await this.saveConfig();
    logger.info(`Trigger rule added/updated: ${rule.id}`);
  }

  async removeRule(ruleId: string): Promise<boolean> {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.id !== ruleId);
    if (this.rules.length < initialLength) {
      await this.saveConfig();
      logger.info(`Trigger rule removed: ${ruleId}`);
      return true;
    }
    return false;
  }

  async toggleRule(ruleId: string, enabled: boolean): Promise<boolean> {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      await this.saveConfig();
      logger.info(`Trigger rule ${ruleId} ${enabled ? "enabled" : "disabled"}`);
      return true;
    }
    return false;
  }

  updateCooldown(ruleId: string): void {
    this.cooldowns.set(ruleId, Date.now());
  }

  getStats(): {
    totalRules: number;
    enabledRules: number;
    rulesByPriority: Record<string, number>;
    activeCooldowns: number;
  } {
    const enabledRules = this.getEnabledRules();
    const rulesByPriority: Record<string, number> = {};

    this.rules.forEach((rule) => {
      const priorityRange = `${Math.floor(rule.priority / 10) * 10}-${
        Math.floor(rule.priority / 10) * 10 + 9
      }`;
      rulesByPriority[priorityRange] =
        (rulesByPriority[priorityRange] || 0) + 1;
    });

    return {
      totalRules: this.rules.length,
      enabledRules: enabledRules.length,
      rulesByPriority,
      activeCooldowns: this.cooldowns.size,
    };
  }

  async saveConfig(): Promise<void> {
    try {
      await Utils.writeJsonFile(this.configPath, { rules: this.rules });
    } catch (error) {
      logger.error("Error saving trigger rules configuration:", error);
      throw error;
    }
  }

  async reloadConfig(): Promise<void> {
    this.cooldowns.clear();
    this.loadConfig();
    logger.info("Trigger rules configuration reloaded");
  }

  exportConfig(): { rules: TriggerRule[] } {
    return { rules: JSON.parse(JSON.stringify(this.rules)) };
  }

  async importConfig(config: { rules: TriggerRule[] }): Promise<void> {
    const { error } = this.configSchema.validate(config);
    if (error) {
      throw new Error(`Invalid configuration: ${error.message}`);
    }
    this.rules = config.rules;
    await this.saveConfig();
    logger.info("Trigger rules configuration imported successfully");
  }
}

export function createTriggerRuleManager(
  configPath?: string
): TriggerRuleManager {
  return new TriggerRuleManager(configPath);
}

export default TriggerRuleManager;
