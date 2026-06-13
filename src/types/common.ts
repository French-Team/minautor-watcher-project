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
