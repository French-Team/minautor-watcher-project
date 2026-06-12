import fs from "fs-extra";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Utils } from "../shared/utils.js";
import { createChildLogger } from "../shared/logger.js";

const execAsync = promisify(exec);
const logger = createChildLogger("trigger-correctors");

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    type:
      | "replace"
      | "insert"
      | "delete"
      | "run-command"
      | "eslint-fix"
      | "prettier-format";
    target: string; // Line number, pattern, or 'all'
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
export abstract class BaseCorrector {
  protected config: CorrectionRule;
  protected name: string;

  constructor(name: string, config: CorrectionRule) {
    this.name = name;
    this.config = config;
  }

  /**
   * Check if this corrector can handle the given file and error
   */
  abstract canCorrect(filePath: string, error?: any): boolean;

  /**
   * Apply corrections to a file
   */
  abstract applyCorrection(
    filePath: string,
    error?: any
  ): Promise<CorrectionResult>;

  /**
   * Get corrector name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if corrector is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get priority (higher = more important)
   */
  getPriority(): number {
    return this.config.priority;
  }
}

/**
 * Text replacement corrector
 */
export class TextReplacementCorrector extends BaseCorrector {
  constructor(config: CorrectionRule) {
    super(config.id, config);
  }

  canCorrect(filePath: string, _error?: any): boolean {
    if (!this.isEnabled()) return false;

    const extension = Utils.getFileExtension(filePath);

    // Check file extension condition
    if (this.config.conditions.fileExtensions) {
      if (!this.config.conditions.fileExtensions.includes(extension)) {
        return false;
      }
    }

    // Check file pattern condition
    if (this.config.conditions.filePatterns) {
      const fileName = path.basename(filePath);
      const matchesPattern = this.config.conditions.filePatterns.some(
        (pattern) => fileName.includes(pattern)
      );
      if (!matchesPattern) {
        return false;
      }
    }

    return true;
  }

  async applyCorrection(
    filePath: string,
    _error?: any
  ): Promise<CorrectionResult> {
    const startTime = Date.now();
    const result: CorrectionResult = {
      success: false,
      corrected: false,
      changes: [],
      executionTime: 0,
    };

    try {
      if (!this.isEnabled()) {
        logger.debug(`Corrector ${this.name} is disabled, skipping`);
        result.success = true;
        return result;
      }

      logger.info(`Applying text replacement corrections to ${filePath}`);

      // Read original content
      const originalContent = await fs.readFile(filePath, "utf-8");
      result.originalContent = originalContent;

      let correctedContent = originalContent;
      let hasChanges = false;

      // Apply each action
      for (const action of this.config.actions) {
        if (action.type === "replace") {
          const changes = this.applyTextReplacement(correctedContent, action);
          if (changes.modified) {
            correctedContent = changes.content;
            hasChanges = true;
            result.changes.push(...changes.details);
          }
        } else if (action.type === "insert") {
          const changes = this.applyTextInsertion(correctedContent, action);
          if (changes.modified) {
            correctedContent = changes.content;
            hasChanges = true;
            result.changes.push(...changes.details);
          }
        } else if (action.type === "delete") {
          const changes = this.applyTextDeletion(correctedContent, action);
          if (changes.modified) {
            correctedContent = changes.content;
            hasChanges = true;
            result.changes.push(...changes.details);
          }
        }
      }

      // Write corrected content if there were changes
      if (hasChanges && correctedContent !== originalContent) {
        await fs.writeFile(filePath, correctedContent);
        result.corrected = true;
        result.correctedContent = correctedContent;
        logger.info(
          `Applied ${result.changes.length} corrections to ${filePath}`
        );
      } else {
        logger.debug(`No corrections needed for ${filePath}`);
      }

      result.success = true;
    } catch (error) {
      logger.error(
        `Error applying text replacement corrections to ${filePath}:`,
        error
      );
      result.error = error instanceof Error ? error : new Error(String(error));
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  private applyTextReplacement(
    content: string,
    action: any
  ): {
    modified: boolean;
    content: string;
    details: Array<{
      type: "replace";
      line: number;
      column: number;
      oldText: string;
      newText: string;
    }>;
  } {
    const details: Array<{
      type: "replace";
      line: number;
      column: number;
      oldText: string;
      newText: string;
    }> = [];

    if (action.target === "all") {
      // Replace all occurrences
      const regex = new RegExp(escapeRegex(action.content), "g");
      const newContent = content.replace(regex, action.newContent || "");

      if (newContent !== content) {
        // Calculate approximate line/column for the change
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(action.content)) {
            details.push({
              type: "replace",
              line: i + 1,
              column: lines[i].indexOf(action.content) + 1,
              oldText: action.content,
              newText: action.newContent || "",
            });
          }
        }
      }

      return {
        modified: newContent !== content,
        content: newContent,
        details,
      };
    }

    return { modified: false, content, details };
  }

  private applyTextInsertion(
    content: string,
    action: any
  ): {
    modified: boolean;
    content: string;
    details: Array<{
      type: "insert";
      line: number;
      column: number;
      newText: string;
    }>;
  } {
    const details: Array<{
      type: "insert";
      line: number;
      column: number;
      newText: string;
    }> = [];
    const lines = content.split("\n");
    let targetLine = action.target;

    if (targetLine === "end") {
      targetLine = lines.length;
    }

    if (
      typeof targetLine === "number" &&
      targetLine >= 0 &&
      targetLine <= lines.length
    ) {
      const insertContent = action.content || "";
      lines.splice(targetLine, 0, insertContent);
      details.push({
        type: "insert",
        line: targetLine,
        column: 0,
        newText: insertContent,
      });
    }

    return {
      modified: details.length > 0,
      content: lines.join("\n"),
      details,
    };
  }

  private applyTextDeletion(
    content: string,
    action: any
  ): {
    modified: boolean;
    content: string;
    details: Array<{
      type: "delete";
      line: number;
      column: number;
      oldText: string;
    }>;
  } {
    const details: Array<{
      type: "delete";
      line: number;
      column: number;
      oldText: string;
    }> = [];
    const lines = content.split("\n");

    if (action.target === "all" && action.content) {
      const searchStr = action.content;
      const escaped = escapeRegex(searchStr);
      const regex = new RegExp(escaped, "g");
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length;
        details.push({
          type: "delete",
          line: lineNum,
          column: match.index,
          oldText: match[0],
        });
      }
      return {
        modified: details.length > 0,
        content: content.replace(regex, ""),
        details,
      };
    }

    if (
      typeof action.target === "number" &&
      action.target >= 0 &&
      action.target < lines.length
    ) {
      const deletedLine = lines.splice(action.target, 1)[0];
      details.push({
        type: "delete",
        line: action.target,
        column: 0,
        oldText: deletedLine,
      });
    }

    return {
      modified: details.length > 0,
      content: lines.join("\n"),
      details,
    };
  }
}

/**
 * Command execution corrector
 */
export class CommandCorrector extends BaseCorrector {
  canCorrect(_filePath: string, _error?: any): boolean {
    if (!this.isEnabled()) return false;

    // Check if any action is a command execution
    return this.config.actions.some((action) => action.type === "run-command");
  }

  async applyCorrection(
    filePath: string,
    _error?: any
  ): Promise<CorrectionResult> {
    const startTime = Date.now();
    const result: CorrectionResult = {
      success: false,
      corrected: false,
      changes: [],
      executionTime: 0,
    };

    try {
      logger.info(`Executing command corrections for ${filePath}`);

      // Execute each command action
      for (const action of this.config.actions) {
        if (action.type === "run-command") {
          const commandResult = await this.executeCommand(action, filePath);

          if (commandResult.success) {
            result.corrected = true;
            result.changes.push({
              type: "replace",
              line: 0,
              column: 0,
              oldText: "file-content",
              newText: "corrected-by-command",
            });

            logger.info(`Command correction successful: ${action.command}`);
          } else {
            logger.error(
              `Command correction failed: ${action.command} - ${commandResult.error}`
            );
            result.error = commandResult.error;
            break;
          }
        }
      }

      result.success = result.error === undefined;
    } catch (error) {
      logger.error(`Error applying command corrections to ${filePath}:`, error);
      result.error = error instanceof Error ? error : new Error(String(error));
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  private async executeCommand(
    action: any,
    filePath: string
  ): Promise<{ success: boolean; error?: Error }> {
    try {
      const command = action.command;
      const args = action.args || [];
      const cwd = path.dirname(filePath);

      logger.debug(`Executing command: ${command} ${args.join(" ")} in ${cwd}`);

      const { stderr } = await execAsync(`${command} ${args.join(" ")}`, {
        cwd,
      });

      if (stderr) {
        logger.warn(`Command stderr: ${stderr}`);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

/**
 * ESLint auto-fix corrector
 */
export class ESLintFixCorrector extends BaseCorrector {
  constructor(config: CorrectionRule) {
    super(config.id, config);
  }

  canCorrect(filePath: string, _error?: any): boolean {
    if (!this.isEnabled()) return false;

    const extension = Utils.getFileExtension(filePath);
    return ["js", "ts", "jsx", "tsx"].includes(extension);
  }

  async applyCorrection(
    filePath: string,
    _error?: any
  ): Promise<CorrectionResult> {
    const startTime = Date.now();
    const result: CorrectionResult = {
      success: false,
      corrected: false,
      changes: [],
      executionTime: 0,
    };

    try {
      logger.info(`Running ESLint auto-fix on ${filePath}`);

      const { stdout, stderr } = await execAsync(
        `npx eslint --fix "${filePath}"`
      );

      result.corrected = !stderr || !stderr.includes("error");
      result.success = true;

      if (stderr) {
        logger.warn(`ESLint stderr: ${stderr}`);
      }

      if (stdout) {
        logger.debug(`ESLint output: ${stdout}`);
      }

      // Read the corrected content
      if (result.corrected) {
        result.correctedContent = await fs.readFile(filePath, "utf-8");
      }
    } catch (error) {
      logger.error(`ESLint auto-fix failed for ${filePath}:`, error);
      result.error = error instanceof Error ? error : new Error(String(error));
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }
}

/**
 * Prettier format corrector
 */
export class PrettierFormatCorrector extends BaseCorrector {
  constructor(config: CorrectionRule) {
    super(config.id, config);
  }

  canCorrect(filePath: string, _error?: any): boolean {
    if (!this.isEnabled()) return false;

    const extension = Utils.getFileExtension(filePath);
    return ["js", "ts", "jsx", "tsx", "json", "md", "css", "scss"].includes(
      extension
    );
  }

  async applyCorrection(
    filePath: string,
    _error?: any
  ): Promise<CorrectionResult> {
    const startTime = Date.now();
    const result: CorrectionResult = {
      success: false,
      corrected: false,
      changes: [],
      executionTime: 0,
    };

    try {
      logger.info(`Running Prettier format on ${filePath}`);

      const { stdout, stderr } = await execAsync(
        `npx prettier --write "${filePath}"`
      );

      result.corrected = true;
      result.success = true;

      if (stderr) {
        logger.warn(`Prettier stderr: ${stderr}`);
      }

      if (stdout) {
        logger.debug(`Prettier output: ${stdout}`);
      }

      // Read the formatted content
      result.correctedContent = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      logger.error(`Prettier format failed for ${filePath}:`, error);
      result.error = error instanceof Error ? error : new Error(String(error));
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }
}

/**
 * Corrector registry and factory
 */
export class CorrectorRegistry {
  private correctors: Map<string, BaseCorrector> = new Map();

  /**
   * Register a corrector
   */
  register(name: string, corrector: BaseCorrector): void {
    this.correctors.set(name, corrector);
    logger.info(`Corrector registered: ${name}`);
  }

  /**
   * Get a corrector by name
   */
  get(name: string): BaseCorrector | undefined {
    return this.correctors.get(name);
  }

  /**
   * Get all registered correctors
   */
  getAll(): BaseCorrector[] {
    return Array.from(this.correctors.values());
  }

  /**
   * Get correctors applicable to a file
   */
  getApplicableCorrectors(filePath: string, error?: any): BaseCorrector[] {
    return this.getAll()
      .filter((corrector) => corrector.canCorrect(filePath, error))
      .sort((a, b) => b.getPriority() - a.getPriority()); // Sort by priority (highest first)
  }

  /**
   * Apply corrections to a file
   */
  async applyCorrections(
    filePath: string,
    error?: any
  ): Promise<CorrectionResult[]> {
    const applicableCorrectors = this.getApplicableCorrectors(filePath, error);
    const results: CorrectionResult[] = [];

    logger.info(
      `Applying ${applicableCorrectors.length} correctors to ${filePath}`
    );

    for (const corrector of applicableCorrectors) {
      try {
        const result = await corrector.applyCorrection(filePath, error);
        results.push(result);

        if (result.corrected) {
          logger.info(
            `Corrector ${corrector.getName()} successfully corrected ${filePath}`
          );
        }
      } catch (error) {
        logger.error(
          `Corrector ${corrector.getName()} failed for ${filePath}:`,
          error
        );
        results.push({
          success: false,
          corrected: false,
          changes: [],
          executionTime: 0,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
  }
}

/**
 * Create default corrector registry
 */
export function createCorrectorRegistry(): CorrectorRegistry {
  const registry = new CorrectorRegistry();

  // Register default correctors
  registry.register(
    "eslint-fix",
    new ESLintFixCorrector({
      id: "eslint-fix",
      name: "ESLint Auto Fix",
      description: "Automatically fix ESLint errors",
      enabled: true,
      priority: 10,
      conditions: {
        fileExtensions: ["js", "ts", "jsx", "tsx"],
      },
      actions: [],
    })
  );

  registry.register(
    "prettier-format",
    new PrettierFormatCorrector({
      id: "prettier-format",
      name: "Prettier Format",
      description: "Format code with Prettier",
      enabled: true,
      priority: 5,
      conditions: {
        fileExtensions: ["js", "ts", "jsx", "tsx", "json", "md", "css", "scss"],
      },
      actions: [],
    })
  );

  // Text replacement corrector for common patterns
  registry.register(
    "text-replacement",
    new TextReplacementCorrector({
      id: "text-replacement",
      name: "Text Replacement",
      description: "Apply text-based corrections",
      enabled: false,
      priority: 1,
      conditions: {},
      actions: [],
    })
  );

  return registry;
}

export default BaseCorrector;
