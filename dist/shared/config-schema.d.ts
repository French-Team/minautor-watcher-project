import Joi from "joi";
/**
 * Joi schema for validating prevention-rules.json
 */
export declare const preventionConfigSchema: Joi.ObjectSchema<any>;
/**
 * Joi schema for validating trigger-rules.json
 */
export declare const triggerConfigSchema: Joi.ObjectSchema<any>;
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate a config object against a Joi schema
 */
export declare function validateConfig(config: unknown, schema: Joi.ObjectSchema): ValidationResult;
//# sourceMappingURL=config-schema.d.ts.map