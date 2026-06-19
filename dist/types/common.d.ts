/**
 * Common types for the Watcher Service
 */
/**
 * Configuration for WatcherService
 */
export interface WatcherServiceConfig {
    watchDir?: string;
    enablePrevention?: boolean;
    enableTrigger?: boolean;
    port?: number;
    drainTimeout?: number;
    /** If true, emit FILE_ADDED for each existing file during initial scan */
    processExisting?: boolean;
    /** Delay (ms) between emitting each existing file event */
    processExistingDelay?: number;
}
/**
 * Service-level metrics
 */
export interface ServiceMetrics {
    filesProcessed: number;
    filesCorrected: number;
    filesFailed: number;
    totalProcessingTime: number;
    startTime: Date | null;
    lastFileTime: Date | null;
}
/**
 * Module status returned by each module's getStatus()
 */
export interface ModuleStatus {
    [key: string]: unknown;
}
/**
 * Status of all modules
 */
export interface ServiceStatus {
    initialized: boolean;
    running: boolean;
    metrics: ServiceMetrics;
    modules: {
        detection?: ModuleStatus;
        prevention?: ModuleStatus;
        trigger?: ModuleStatus;
    };
    processor?: {
        chains: Array<{
            chainId: number;
            queued: number;
            processing: boolean;
            total: number;
        }>;
        queued: number;
        busy: number;
    };
    resources?: {
        cpu: string;
        memory: string;
        heap: string;
        loadAvg: string;
    };
}
/**
 * Metadata value type (replaces Record<string, any>)
 */
export type MetadataValue = string | number | boolean | null | undefined;
/**
 * Typed metadata record
 */
export type Metadata = Record<string, MetadataValue>;
/**
 * Error info passed between modules
 */
export interface ErrorInfo {
    message: string;
    code?: string;
    details?: Metadata;
}
/**
 * Validation report for a target project directory
 */
export interface ValidationReport {
    dirExists: boolean;
    hasPackageJson: boolean;
    hasNodeModules: boolean;
    eslintVersion: string | null;
    prettierVersion: string | null;
}
//# sourceMappingURL=common.d.ts.map