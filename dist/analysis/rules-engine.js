/**
 * AdaptiveRules - Rule engine that adapts to project analysis
 */
/**
 * Default adaptive rules for project analysis
 */
const DEFAULT_RULES = [
    {
        id: "no-any-type",
        name: "No any type",
        description: "Enforce no usage of `any` type",
        condition: (a) => a.hasTypeScript,
        action: "enforce",
        message: "TypeScript detected. Never use `any` — use `unknown` and narrow types.",
        priority: 1,
    },
    {
        id: "eslint-required",
        name: "ESLint required",
        description: "Recommend ESLint for code quality",
        condition: (a) => !a.hasESLint && a.packageJsonExists,
        action: "suggest",
        message: "ESLint not detected. Consider installing it for code quality.",
        priority: 2,
    },
    {
        id: "prettier-recommended",
        name: "Prettier recommended",
        description: "Recommend Prettier for formatting",
        condition: (a) => !a.hasPrettier && a.hasESLint,
        action: "suggest",
        message: "ESLint detected but Prettier is not. Consider adding Prettier for consistent formatting.",
        priority: 3,
    },
    {
        id: "tests-required",
        name: "Tests required",
        description: "Ensure test framework is present",
        condition: (a) => !a.hasTests && a.srcDir,
        action: "suggest",
        message: "No test framework detected. Consider adding tests for your code.",
        priority: 4,
    },
    {
        id: "winston-logging",
        name: "Winston logging",
        description: "Use Winston for structured logging",
        condition: (a) => a.hasTypeScript,
        action: "enforce",
        message: "Use Winston logger instead of console.log for structured logging.",
        priority: 5,
    },
    {
        id: "safe-spawn",
        name: "Safe spawn",
        description: "Use safeSpawn for child processes",
        condition: () => true,
        action: "enforce",
        message: "Use safeSpawn() instead of exec() for child processes to prevent injection.",
        priority: 6,
    },
    {
        id: "sanitize-paths",
        name: "Sanitize paths",
        description: "Sanitize all file paths",
        condition: () => true,
        action: "enforce",
        message: "Use sanitizePath() before any file path operation to prevent traversal.",
        priority: 7,
    },
    {
        id: "monorepo-structure",
        name: "Monorepo structure",
        description: "Adapt rules for monorepo architecture",
        condition: (a) => a.architecture === "monorepo",
        action: "suggest",
        message: "Monorepo detected. Consider workspace-specific configs and shared packages.",
        priority: 8,
    },
    {
        id: "consignment-files",
        name: "Consignment files",
        description: "Ensure agent guidance files exist",
        condition: (a) => !a.hasConsignmentFiles,
        action: "suggest",
        message: "No consignment files (CLAUDE.md, AGENTS.md). Inject them to guide AI agents.",
        priority: 9,
    },
    {
        id: "esm-modules",
        name: "ESM modules",
        description: "Enforce ESM module system",
        condition: (a) => a.hasTypeScript,
        action: "enforce",
        message: "Use ESM modules (import/export) instead of CommonJS (require).",
        priority: 10,
    },
    {
        id: "config-validation",
        name: "Config validation",
        description: "Validate configuration with Joi",
        condition: (a) => a.configDir,
        action: "enforce",
        message: "Validate all configuration files with Joi schema at startup.",
        priority: 11,
    },
    {
        id: "no-console-log",
        name: "No console.log",
        description: "Prevent console.log in production",
        condition: (a) => a.hasTypeScript || a.hasESLint,
        action: "enforce",
        message: "Do not use console.log in production code. Use Winston logger.",
        priority: 12,
    },
];
/**
 * Evaluate adaptive rules against a project analysis
 */
export function evaluateRules(analysis, rules) {
    const effectiveRules = rules ?? DEFAULT_RULES;
    const evaluations = [];
    for (const rule of effectiveRules) {
        const triggered = rule.condition(analysis);
        evaluations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            action: triggered ? rule.action : "skip",
            message: triggered ? rule.message : "",
            triggered,
        });
    }
    return evaluations;
}
/**
 * Get rules that would trigger for a given analysis
 */
export function getTriggeredRules(analysis, rules) {
    return evaluateRules(analysis, rules).filter((e) => e.triggered);
}
/**
 * Get enforce-only rules that triggered
 */
export function getEnforcedRules(analysis, rules) {
    return getTriggeredRules(analysis, rules).filter((e) => e.action === "enforce");
}
/**
 * Get suggest-only rules that triggered
 */
export function getSuggestedRules(analysis, rules) {
    return getTriggeredRules(analysis, rules).filter((e) => e.action === "suggest");
}
/**
 * Format evaluation results as human-readable string
 */
export function formatEvaluations(evaluations) {
    const triggered = evaluations.filter((e) => e.triggered);
    if (triggered.length === 0)
        return "No rules triggered.";
    const lines = [
        `Triggered rules: ${triggered.length}/${evaluations.length}`,
        "",
    ];
    for (const e of triggered) {
        const icon = e.action === "enforce" ? "!" : "?";
        lines.push(`  [${icon}] ${e.ruleName}: ${e.message}`);
    }
    return lines.join("\n");
}
/**
 * Get all default adaptive rules
 */
export function getDefaultRules() {
    return [...DEFAULT_RULES];
}
//# sourceMappingURL=rules-engine.js.map