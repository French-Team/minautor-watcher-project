/**
 * Prevention module types
 */
/**
 * Custom validator configuration
 */
export interface CustomValidatorConfig {
    name: string;
    config: Record<string, unknown>;
}
/**
 * Custom script configuration
 */
export interface CustomScriptConfig {
    name: string;
    config: Record<string, unknown>;
}
/**
 * Legacy prevention config (for backward compatibility)
 */
export interface LegacyPreventionConfig {
    enabled?: boolean;
    rules?: Array<{
        name?: string;
        enabled?: boolean;
        severity?: string;
        category?: string;
        validators?: string[];
        scripts?: string[];
        extensions?: string[];
    }>;
    globalSettings?: {
        failOnError?: boolean;
        failOnWarning?: boolean;
        maxExecutionTime?: number;
        parallelExecution?: boolean;
    };
}
//# sourceMappingURL=prevention.d.ts.map