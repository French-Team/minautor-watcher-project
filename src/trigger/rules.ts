import fs from 'fs-extra';
import path from 'path';
import Joi from 'joi';
import { Utils } from '../shared/utils.js';
import { createChildLogger } from '../shared/logger.js';

const logger = createChildLogger('trigger-rules');

/**
 * Trigger rule definition
 */
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
    severity?: 'error' | 'warning' | 'info';
    metadataConditions?: Record<string, any>;
  };
  actions: Array<{
    type: 'correct' | 'notify' | 'log' | 'skip' | 'custom';
    target?: string; // Corrector name, notifier channel, etc.
    config?: Record<string, any>;
    delay?: number; // Delay in milliseconds
  }>;
  cooldown?: {
    enabled: boolean;
    period: number; // Cooldown period in milliseconds
  };
  metadata?: Record<string, any>;
}

/**
 * Trigger execution context
 */
export interface TriggerContext {
  filePath: string;
  eventType: string;
  error?: any;
  metadata?: Record<string, any>;
  timestamp: Date;
}

/**
 * Trigger execution result
 */
export interface TriggerResult {
  ruleId: string;
  success: boolean;
  actions: Array<{
    type: string;
    success: boolean;
    result?: any;
    error?: Error;
  }>;
  executionTime: number;
  skipped?: boolean;
  cooldown?: boolean;
  error?: Error;
}

/**
 * Trigger rule manager
 */
export class TriggerRuleManager {
  private rules: TriggerRule[] = [];
  private configPath: string;
  private configSchema: Joi.ObjectSchema;
  private cooldowns: Map<string, number> = new Map(); // ruleId -> last execution time

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'trigger-rules.json');

    // Define configuration schema (new format: { rules: TriggerRule[] })
    this.configSchema = Joi.object({
      rules: Joi.array().items(
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
            severity: Joi.string().valid('error', 'warning', 'info'),
            metadataConditions: Joi.object().default({}),
          }).default(),
          actions: Joi.array().items(
            Joi.object({
              type: Joi.string().valid('correct', 'notify', 'log', 'skip', 'custom').required(),
              target: Joi.string(),
              config: Joi.object().default({}),
              delay: Joi.number().default(0),
            })
          ).default([]),
          cooldown: Joi.object({
            enabled: Joi.boolean().default(false),
            period: Joi.number().default(60000),
          }).default(),
        })
      ).default([]),
    });

    // Load configuration
    this.loadConfig();
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): void {
    try {
      if (fs.pathExistsSync(this.configPath)) {
        const fileConfig = fs.readJsonSync(this.configPath, { throws: false }) as any;
        if (fileConfig) {
          // Try new format first: { rules: TriggerRule[] }
          if (fileConfig.rules) {
            const { error, value } = this.configSchema.validate(fileConfig, { allowUnknown: true });
            if (!error) {
              this.rules = value.rules || [];
              logger.info(`Loaded ${this.rules.length} trigger rules from configuration`);
              return;
            }
          }

          // Fall back to legacy format: { corrections, notifications, conditions }
          if (fileConfig.corrections || fileConfig.conditions) {
            const converted = this.convertLegacyConfig(fileConfig);
            this.rules = converted.rules;
            logger.info(`Converted legacy config: ${this.rules.length} trigger rules`);
            return;
          }

          logger.warn('Unrecognized configuration format. Using defaults.');
        }
      }
    } catch (error) {
      logger.error('Error loading trigger rules configuration:', error);
    }

    logger.info('Using default trigger rules');
    this.loadDefaultRules();
  }

  /**
   * Convert legacy trigger-rules.json format to internal TriggerRule[]
   */
  private convertLegacyConfig(fileConfig: any): { rules: TriggerRule[] } {
    const rules: TriggerRule[] = [];

    // Convert autoCorrect settings to rules
    const autoCorrect = fileConfig.autoCorrect || {};
    const maxFileSize = autoCorrect.maxFileSize ? this.parseFileSize(autoCorrect.maxFileSize) : 5 * 1024 * 1024;
    const defaultTimeout = autoCorrect.timeout || 30000;

    // Convert each correction entry to a trigger rule
    if (fileConfig.corrections && Array.isArray(fileConfig.corrections)) {
      for (const corr of fileConfig.corrections) {
        if (!corr.enabled) continue;

        const rule: TriggerRule = {
          id: `correction-${corr.ruleId}`,
          name: corr.description || `Correction: ${corr.ruleId}`,
          description: corr.description || '',
          enabled: true,
          priority: 5,
          conditions: {
            eventTypes: ['fileModified', 'fileDetected'],
            fileExtensions: corr.extensions || ['js', 'ts', 'jsx', 'tsx'],
          },
          actions: [],
          cooldown: { enabled: true, period: 5000 },
        };

        switch (corr.action) {
          case 'run-eslint-fix':
          case 'eslint-fix':
            rule.actions.push({ type: 'correct', target: 'eslint-fix', delay: 100 });
            break;
          case 'run-prettier':
          case 'prettier-format':
            rule.actions.push({ type: 'correct', target: 'prettier-format', delay: 50 });
            break;
          case 'replace':
            if (corr.pattern && corr.replacement) {
              rule.actions.push({
                type: 'correct',
                target: 'text-replacement',
                config: { pattern: corr.pattern, replacement: corr.replacement },
              });
            }
            break;
          case 'remove':
            rule.actions.push({ type: 'correct', target: 'eslint-fix' });
            break;
          case 'merge':
            rule.actions.push({ type: 'correct', target: 'eslint-fix' });
            break;
          default:
            rule.actions.push({ type: 'log', config: { level: 'info' } });
        }

        rules.push(rule);
      }
    }

    // Convert conditions to skip rules
    if (fileConfig.conditions && Array.isArray(fileConfig.conditions)) {
      for (const cond of fileConfig.conditions) {
        if (cond.action === 'skip') {
          rules.push({
            id: `condition-${cond.name}`,
            name: `Condition: ${cond.name}`,
            description: `Skip rule for: ${cond.condition}`,
            enabled: true,
            priority: 100,
            conditions: {
              eventTypes: ['fileModified', 'fileDetected'],
            },
            actions: [
              {
                type: 'skip',
                config: { maxFileSize },
              },
            ],
          });
        }
      }
    }

    // Add notification rule if notifications.onFailure is enabled
    const notifications = fileConfig.notifications || {};
    if (notifications.onFailure) {
      const channels = (notifications.channels || ['console']).join(',');
      rules.push({
        id: 'notify-on-failure',
        name: 'Notify on failure',
        description: 'Send notification when corrections fail',
        enabled: true,
        priority: 1,
        conditions: {
          eventTypes: ['preventionFailed'],
          severity: 'error',
        },
        actions: [
          {
            type: 'notify',
            target: channels,
            config: { level: 'error' },
          },
        ],
        cooldown: { enabled: true, period: notifications.throttle || 300000 },
      });
    }

    return { rules };
  }

  /**
   * Parse file size strings like '1MB', '500KB' to bytes
   */
  private parseFileSize(size: string): number {
    const match = size.match(/^(\d+)\s*(KB|MB|GB)?$/i);
    if (!match) return 5 * 1024 * 1024;
    const num = parseInt(match[1], 10);
    switch ((match[2] || 'MB').toUpperCase()) {
      case 'KB': return num * 1024;
      case 'GB': return num * 1024 * 1024 * 1024;
      case 'MB':
      default: return num * 1024 * 1024;
    }
  }

  /**
   * Load default trigger rules
   */
  private loadDefaultRules(): void {
    this.rules = [
      {
        id: 'auto-correct-eslint',
        name: 'Auto-correct ESLint errors',
        description: 'Automatically fix ESLint errors in JavaScript/TypeScript files',
        enabled: true,
        priority: 10,
        conditions: {
          eventTypes: ['fileModified'],
          fileExtensions: ['js', 'ts', 'jsx', 'tsx'],
          errorPatterns: ['eslint'],
        },
        actions: [
          {
            type: 'correct',
            target: 'eslint-fix',
            delay: 100,
          },
        ],
      },
      {
        id: 'format-with-prettier',
        name: 'Format with Prettier',
        description: 'Format supported files with Prettier',
        enabled: true,
        priority: 5,
        conditions: {
          eventTypes: ['fileModified'],
          fileExtensions: ['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'css', 'scss'],
        },
        actions: [
          {
            type: 'correct',
            target: 'prettier-format',
            delay: 50,
          },
        ],
      },
      {
        id: 'notify-on-correction-failure',
        name: 'Notify on correction failure',
        description: 'Send notification when automatic corrections fail',
        enabled: true,
        priority: 1,
        conditions: {
          eventTypes: ['correctionFailed'],
          severity: 'error',
        },
        actions: [
          {
            type: 'notify',
            target: 'slack,email',
            config: {
              level: 'error',
            },
          },
        ],
      },
      {
        id: 'log-file-changes',
        name: 'Log file changes',
        description: 'Log all file changes for audit purposes',
        enabled: true,
        priority: 0,
        conditions: {
          eventTypes: ['fileModified', 'fileAdded', 'fileDeleted'],
        },
        actions: [
          {
            type: 'log',
            config: {
              level: 'info',
            },
          },
        ],
      },
      {
        id: 'skip-large-files',
        name: 'Skip large files',
        description: 'Skip processing very large files to avoid performance issues',
        enabled: true,
        priority: 100, // High priority to run first
        conditions: {
          eventTypes: ['fileModified'],
        },
        actions: [
          {
            type: 'skip',
            config: {
              maxFileSize: 5 * 1024 * 1024, // 5MB
            },
          },
        ],
      },
    ];

    logger.info(`Loaded ${this.rules.length} default trigger rules`);
  }

  /**
   * Get all rules
   */
  getRules(): TriggerRule[] {
    return [...this.rules];
  }

  /**
   * Get enabled rules
   */
  getEnabledRules(): TriggerRule[] {
    return this.rules.filter(rule => rule.enabled);
  }

  /**
   * Get rules applicable to a context
   */
  getApplicableRules(context: TriggerContext): TriggerRule[] {
    const enabledRules = this.getEnabledRules();

    return enabledRules
      .filter(rule => this.ruleMatchesContext(rule, context))
      .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)
  }

  /**
   * Check if a rule matches the given context
   */
  private ruleMatchesContext(rule: TriggerRule, context: TriggerContext): boolean {
    // Check event type condition
    if (rule.conditions.eventTypes) {
      if (!rule.conditions.eventTypes.includes(context.eventType)) {
        return false;
      }
    }

    // Check file extension condition
    if (rule.conditions.fileExtensions) {
      const extension = Utils.getFileExtension(context.filePath);
      if (!rule.conditions.fileExtensions.includes(extension)) {
        return false;
      }
    }

    // Check file pattern condition
    if (rule.conditions.filePatterns) {
      const fileName = path.basename(context.filePath);
      const matchesPattern = rule.conditions.filePatterns.some(pattern =>
        fileName.includes(pattern) || context.filePath.includes(pattern)
      );
      if (!matchesPattern) {
        return false;
      }
    }

    // Check error pattern condition
    if (rule.conditions.errorPatterns && context.error) {
      const errorMessage = context.error.message || String(context.error);
      const matchesErrorPattern = rule.conditions.errorPatterns.some(pattern =>
        errorMessage.includes(pattern)
      );
      if (!matchesErrorPattern) {
        return false;
      }
    }

    // Check severity condition
    if (rule.conditions.severity && context.metadata?.severity) {
      if (rule.conditions.severity !== context.metadata.severity) {
        return false;
      }
    }

    // Check metadata conditions
    if (rule.conditions.metadataConditions) {
      for (const [key, value] of Object.entries(rule.conditions.metadataConditions)) {
        if (context.metadata?.[key] !== value) {
          return false;
        }
      }
    }

    // Check cooldown
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

  /**
   * Add a new rule
   */
  async addRule(rule: TriggerRule): Promise<void> {
      // Validate the new rule
      const ruleSchema = this.configSchema.extract('rules').extract('items') as Joi.ObjectSchema;
      Utils.validateConfig(rule, ruleSchema);

    // Check if rule already exists
    const existingIndex = this.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }

    await this.saveConfig();
    logger.info(`Trigger rule added/updated: ${rule.id}`);
  }

  /**
   * Remove a rule
   */
  async removeRule(ruleId: string): Promise<boolean> {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => rule.id !== ruleId);

    if (this.rules.length < initialLength) {
      await this.saveConfig();
      logger.info(`Trigger rule removed: ${ruleId}`);
      return true;
    }

    return false;
  }

  /**
   * Enable/disable a rule
   */
  async toggleRule(ruleId: string, enabled: boolean): Promise<boolean> {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      await this.saveConfig();
      logger.info(`Trigger rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Update rule execution time for cooldown tracking
   */
  updateCooldown(ruleId: string): void {
    this.cooldowns.set(ruleId, Date.now());
  }

  /**
   * Get configuration statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    rulesByPriority: Record<string, number>;
    activeCooldowns: number;
  } {
    const enabledRules = this.getEnabledRules();
    const rulesByPriority: Record<string, number> = {};

    this.rules.forEach(rule => {
      const priorityRange = `${Math.floor(rule.priority / 10) * 10}-${Math.floor(rule.priority / 10) * 10 + 9}`;
      rulesByPriority[priorityRange] = (rulesByPriority[priorityRange] || 0) + 1;
    });

    return {
      totalRules: this.rules.length,
      enabledRules: enabledRules.length,
      rulesByPriority,
      activeCooldowns: this.cooldowns.size,
    };
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    try {
      await Utils.writeJsonFile(this.configPath, { rules: this.rules });
    } catch (error) {
      logger.error('Error saving trigger rules configuration:', error);
      throw error;
    }
  }

  /**
   * Reload configuration from file
   */
  async reloadConfig(): Promise<void> {
    this.cooldowns.clear(); // Reset cooldowns on reload
    this.loadConfig();
    logger.info('Trigger rules configuration reloaded');
  }

  /**
   * Export configuration for backup
   */
  exportConfig(): { rules: TriggerRule[] } {
    return { rules: JSON.parse(JSON.stringify(this.rules)) };
  }

  /**
   * Import configuration from backup
   */
  async importConfig(config: { rules: TriggerRule[] }): Promise<void> {
    // Validate the imported config
    const { error } = this.configSchema.validate(config);
    if (error) {
      throw new Error(`Invalid configuration: ${error.message}`);
    }

    this.rules = config.rules;
    await this.saveConfig();
    logger.info('Trigger rules configuration imported successfully');
  }
}

/**
 * Create a trigger rule manager
 */
export function createTriggerRuleManager(configPath?: string): TriggerRuleManager {
  return new TriggerRuleManager(configPath);
}

export default TriggerRuleManager;
