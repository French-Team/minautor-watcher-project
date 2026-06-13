/**
 * Analysis system types
 * Defines interfaces for project analysis and adaptive rules (V3.4)
 */

/**
 * Detected programming language
 */
export type ProjectLanguage = "typescript" | "javascript" | "mixed" | "unknown";

/**
 * Detected package manager
 */
export type PackageManager = "npm" | "yarn" | "pnpm" | "unknown";

/**
 * Detected test framework
 */
export type TestFramework = "jest" | "vitest" | "mocha" | "unknown";

/**
 * Detected project architecture
 */
export type ProjectArchitecture = "monorepo" | "single" | "library" | "unknown";

/**
 * Code conventions detected in the project
 */
export interface CodeConventions {
  indentStyle: "spaces" | "tabs";
  indentSize: number;
  lineEnding: "lf" | "crlf";
  semicolons: boolean;
  quotes: "single" | "double";
}

/**
 * Full project analysis result
 */
export interface ProjectAnalysis {
  name: string;
  language: ProjectLanguage;
  framework?: string;
  packageManager: PackageManager;
  hasTypeScript: boolean;
  hasESLint: boolean;
  hasPrettier: boolean;
  hasTests: boolean;
  testFramework?: TestFramework;
  architecture?: ProjectArchitecture;
  conventions: CodeConventions;
  hasConsignmentFiles: boolean;
  consignmentFiles: string[];
  srcDir: boolean;
  testDir: boolean;
  configDir: boolean;
  packageJsonExists: boolean;
  tsconfigExists: boolean;
}

/**
 * Action type for adaptive rules
 */
export type RuleAction = "enforce" | "suggest" | "skip";

/**
 * An adaptive rule that reacts to project analysis
 */
export interface AdaptiveRule {
  id: string;
  name: string;
  description: string;
  condition: (analysis: ProjectAnalysis) => boolean;
  action: RuleAction;
  message: string;
  priority: number;
}

/**
 * Result of evaluating adaptive rules against a project
 */
export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  action: RuleAction;
  message: string;
  triggered: boolean;
}

/**
 * Interface for an intelligent module that can analyze and suggest
 */
export interface IntelligentModule {
  analyze(projectDir: string): Promise<ProjectAnalysis>;
  suggestRules(analysis: ProjectAnalysis): Promise<RuleEvaluation[]>;
  generateConsignment(analysis: ProjectAnalysis): Promise<string>;
}
