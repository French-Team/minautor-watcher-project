/**
 * Unified watcher service configuration
 */
export interface WatcherConfig {
    watchDir: string;
    excludedDirs?: string[];
    watchExtensions?: string[];
    processingDelay?: number;
    prevention?: {
        enabled?: boolean;
        rules?: unknown[];
        globalSettings?: {
            failOnError?: boolean;
            failOnWarning?: boolean;
            maxExecutionTime?: number;
            parallelExecution?: boolean;
        };
    };
    trigger?: {
        rules?: unknown[];
        enabled?: boolean;
    };
    plugins?: {
        dir?: string;
        enabled?: string[];
        disabled?: string[];
    };
}
/**
 * Load and merge configuration from multiple sources:
 * 1. Default values
 * 2. Legacy separate files (prevention-rules.json, trigger-rules.json)
 * 3. Unified config file (watcher.config.json)
 * 4. Environment variables
 */
export declare function loadUnifiedConfig(configDir?: string): WatcherConfig;
/**
 * Save unified config to disk
 */
export declare function saveUnifiedConfig(config: WatcherConfig, configDir?: string): void;
//# sourceMappingURL=unified-config.d.ts.map