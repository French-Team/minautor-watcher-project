/**
 * Consignment templates for AI agent guidance
 * These files are injected into projects so agents follow consistent rules
 */
import type { ConsignmentTemplate, AgentType } from "./types.js";
/**
 * Get all available templates
 */
export declare function getAllTemplates(): ConsignmentTemplate[];
/**
 * Get templates for a specific agent
 */
export declare function getTemplatesForAgent(agent: AgentType): ConsignmentTemplate[];
/**
 * Get a template by ID
 */
export declare function getTemplateById(id: string): ConsignmentTemplate | undefined;
/**
 * Get the file name for an agent's consignment file
 */
export declare function getFileNameForAgent(agent: AgentType): string | undefined;
/**
 * Get the managed-by header
 */
export declare function getManagedHeader(): string;
//# sourceMappingURL=templates.d.ts.map