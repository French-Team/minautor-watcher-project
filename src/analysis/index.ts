/**
 * Analysis module - Project analysis and adaptive rules for intelligent watcher
 *
 * Analyzes project structure, detects conventions, and evaluates adaptive rules
 * to tailor the watcher's behavior to each project.
 */

// Types
export type {
  ProjectAnalysis,
  ProjectLanguage,
  PackageManager,
  TestFramework,
  ProjectArchitecture,
  CodeConventions,
  AdaptiveRule,
  RuleAction,
  RuleEvaluation,
  IntelligentModule,
} from "./types.js";

// Project analyzer
export { analyzeProject, formatAnalysis } from "./project-analyzer.js";

// Rules engine
export {
  evaluateRules,
  getTriggeredRules,
  getEnforcedRules,
  getSuggestedRules,
  formatEvaluations,
  getDefaultRules,
} from "./rules-engine.js";
