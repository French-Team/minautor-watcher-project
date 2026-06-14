import Joi from "joi";
/**
 * Joi schema for validating prevention-rules.json
 */
export const preventionConfigSchema = Joi.object({
    enabled: Joi.boolean().default(true),
    rules: Joi.array()
        .items(Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
        description: Joi.string().required(),
        enabled: Joi.boolean().default(true),
        severity: Joi.string()
            .valid("error", "warning", "info")
            .default("warning"),
        category: Joi.string()
            .valid("syntax", "style", "security", "performance", "custom")
            .default("custom"),
        validators: Joi.array().items(Joi.string()).default([]),
        scripts: Joi.array().items(Joi.string()).default([]),
        conditions: Joi.object({
            fileExtensions: Joi.array().items(Joi.string()),
            filePatterns: Joi.array().items(Joi.string()),
            minFileSize: Joi.number(),
            maxFileSize: Joi.number(),
        }).optional(),
        actions: Joi.object({
            autoFix: Joi.boolean().default(false),
            notifyOnFailure: Joi.boolean().default(true),
            blockCommit: Joi.boolean().default(false),
        }).optional(),
        metadata: Joi.object().optional(),
    }))
        .default([]),
    globalSettings: Joi.object({
        failOnError: Joi.boolean().default(true),
        failOnWarning: Joi.boolean().default(false),
        maxExecutionTime: Joi.number().default(30000),
        parallelExecution: Joi.boolean().default(true),
    }).default({
        failOnError: true,
        failOnWarning: false,
        maxExecutionTime: 30000,
        parallelExecution: true,
    }),
    customValidators: Joi.array()
        .items(Joi.object({
        name: Joi.string().required(),
        config: Joi.any(),
    }))
        .optional(),
    customScripts: Joi.array()
        .items(Joi.object({
        name: Joi.string().required(),
        config: Joi.any(),
    }))
        .optional(),
});
/**
 * Joi schema for validating trigger-rules.json
 */
export const triggerConfigSchema = Joi.object({
    rules: Joi.array()
        .items(Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
        description: Joi.string().required(),
        enabled: Joi.boolean().default(true),
        priority: Joi.number().default(0),
        conditions: Joi.object({
            eventTypes: Joi.array().items(Joi.string()),
            fileExtensions: Joi.array().items(Joi.string()),
            filePatterns: Joi.array().items(Joi.string()),
            errorPatterns: Joi.array().items(Joi.string()),
            severity: Joi.string().valid("error", "warning", "info"),
            metadataConditions: Joi.object(),
        }).optional(),
        actions: Joi.array()
            .items(Joi.object({
            type: Joi.string()
                .valid("correct", "notify", "log", "skip", "custom")
                .required(),
            target: Joi.string().optional(),
            config: Joi.object().optional(),
            delay: Joi.number().optional(),
        }))
            .required(),
        cooldown: Joi.object({
            enabled: Joi.boolean().default(false),
            period: Joi.number().default(0),
        }).optional(),
        metadata: Joi.object().optional(),
    }))
        .default([]),
    autoCorrect: Joi.object({
        enabled: Joi.boolean().default(false),
        maxFileSize: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
        timeout: Joi.number().default(30000),
        retryAttempts: Joi.number().default(3),
    }).optional(),
    notifications: Joi.object({
        onSuccess: Joi.boolean().default(false),
        onFailure: Joi.boolean().default(true),
        channels: Joi.array().items(Joi.string()).default([]),
        throttle: Joi.number().default(300000),
    }).optional(),
    conditions: Joi.array()
        .items(Joi.object({
        name: Joi.string().required(),
        condition: Joi.string().required(),
        action: Joi.string().required(),
        notify: Joi.boolean().default(false),
    }))
        .optional(),
});
/**
 * Validate a config object against a Joi schema
 */
export function validateConfig(config, schema) {
    const result = {
        valid: true,
        errors: [],
        warnings: [],
    };
    const { error, warning } = schema.validate(config, {
        allowUnknown: true,
        abortEarly: false,
    });
    if (error) {
        result.valid = false;
        result.errors = error.details.map((d) => d.message);
    }
    if (warning) {
        result.warnings = warning.details.map((d) => d.message);
    }
    return result;
}
//# sourceMappingURL=config-schema.js.map