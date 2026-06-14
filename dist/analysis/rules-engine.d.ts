/**
 * AdaptiveRules - Rule engine that adapts to project analysis
 */
import type { ProjectAnalysis, AdaptiveRule, RuleEvaluation } from "./types.js";
/**
 * Evaluate adaptive rules against a project analysis
 */
export declare function evaluateRules(analysis: ProjectAnalysis, rules?: AdaptiveRule[]): RuleEvaluation[];
/**
 * Get rules that would trigger for a given analysis
 */
export declare function getTriggeredRules(analysis: ProjectAnalysis, rules?: AdaptiveRule[]): RuleEvaluation[];
/**
 * Get enforce-only rules that triggered
 */
export declare function getEnforcedRules(analysis: ProjectAnalysis, rules?: AdaptiveRule[]): RuleEvaluation[];
/**
 * Get suggest-only rules that triggered
 */
export declare function getSuggestedRules(analysis: ProjectAnalysis, rules?: AdaptiveRule[]): RuleEvaluation[];
/**
 * Format evaluation results as human-readable string
 */
export declare function formatEvaluations(evaluations: RuleEvaluation[]): string;
/**
 * Get all default adaptive rules
 */
export declare function getDefaultRules(): AdaptiveRule[];
//# sourceMappingURL=rules-engine.d.ts.map