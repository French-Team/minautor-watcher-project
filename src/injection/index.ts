/**
 * Injection module - Consignment file management for AI agent guidance
 *
 * This module detects missing/outdated agent guidance files (CLAUDE.md, AGENTS.md, etc.)
 * and injects them into projects so AI agents follow consistent rules.
 */

// Types
export type {
  AgentType,
  AgentStatus,
  ConsignmentTemplate,
  InjectionAction,
  InjectionApplyOptions,
  InjectionCheckOptions,
  InjectionCheckResult,
  InjectionConfig,
  InjectionResult,
} from "./types.js";

// Templates
export {
  getAllTemplates,
  getTemplatesForAgent,
  getTemplateById,
  getFileNameForAgent,
  getManagedHeader,
} from "./templates.js";

// Detection
export { checkInjectionStatus, formatCheckResult } from "./detector.js";

// Injection
export { injectFiles, formatInjectionResults } from "./injector.js";

// Prevention integration
export {
  validateConsignmentFiles,
  formatConsignmentResult,
} from "./validator.js";
export type { ConsignmentValidatorConfig } from "./validator.js";
