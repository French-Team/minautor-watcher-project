/**
 * Injection module - Consignment file management for AI agent guidance
 *
 * This module detects missing/outdated agent guidance files (CLAUDE.md, AGENTS.md, etc.)
 * and injects them into projects so AI agents follow consistent rules.
 */
export type { AgentType, AgentStatus, ConsignmentTemplate, InjectionAction, InjectionApplyOptions, InjectionCheckOptions, InjectionCheckResult, InjectionConfig, InjectionResult, } from "./types.js";
export { getAllTemplates, getTemplatesForAgent, getTemplateById, getFileNameForAgent, getManagedHeader, getEslintTemplate, } from "./templates.js";
export { checkInjectionStatus, formatCheckResult } from "./detector.js";
export { injectFiles, formatInjectionResults } from "./injector.js";
export { validateConsignmentFiles, formatConsignmentResult, } from "./validator.js";
export type { ConsignmentValidatorConfig } from "./validator.js";
//# sourceMappingURL=index.d.ts.map