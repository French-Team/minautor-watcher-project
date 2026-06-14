/**
 * ConsignmentValidator - Prevention integration for consignment files
 * Validates that required agent guidance files exist in a project
 */
import type { ValidationResult } from "../prevention/validators.js";
import { type AgentType, type InjectionConfig } from "./types.js";
/**
 * Config for the consignment validator
 */
export interface ConsignmentValidatorConfig {
    enabled: boolean;
    requiredAgents: AgentType[];
    autoFix: boolean;
    config?: InjectionConfig;
}
/**
 * Validate that consignment files exist in a project directory
 */
export declare function validateConsignmentFiles(projectDir: string, validatorConfig?: Partial<ConsignmentValidatorConfig>): Promise<ValidationResult>;
/**
 * Get a human-readable summary of validation results
 */
export declare function formatConsignmentResult(result: ValidationResult): string;
//# sourceMappingURL=validator.d.ts.map