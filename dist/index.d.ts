import { PreventionModule } from "./prevention/index.js";
import { TriggerModule } from "./trigger/index.js";
import { ResourceMonitor } from "./monitor/index.js";
import type { WatcherServiceConfig, ServiceMetrics, ServiceStatus, ValidationReport } from "./types/common.js";
export type { ServiceMetrics } from "./types/common.js";
export { CURRENT_YEAR, WATCHER_VERSION, getSystemInfo, detectTools, detectDevEnvironment, generateEnvReport, printBanner, printCompactBanner, } from "./environment/index.js";
/**
 * Main Watcher Service class that orchestrates all modules
 */
export declare class WatcherService {
    private detectionModule?;
    private preventionModule?;
    private triggerModule?;
    private httpServer;
    private resourceMonitor;
    private chainOrchestrator;
    private activeWarnings;
    private config;
    private isRunning;
    private draining;
    private activeTasks;
    private drainResolvers;
    private metrics;
    private activeWarningsInitialized;
    private scanSummary;
    private scanFileCount;
    private validationResult;
    private reportDebounceTimer;
    private readonly REPORT_IDLE_MS;
    constructor(config?: WatcherServiceConfig);
    getMetrics(): ServiceMetrics;
    resetMetrics(): void;
    /**
     * Build and write the final report file.
     * Called on idle detection and on shutdown.
     */
    private writeReportFile;
    /**
     * Debounced report update: resets a 20s timer on each file event.
     * The report is only written once the pipeline has been idle for 20s.
     */
    private scheduleReportUpdate;
    /**
     * Validate the target project directory for required tooling
     */
    validateTargetProject(dir: string): Promise<ValidationReport>;
    getPreventionModule(): PreventionModule | undefined;
    getTriggerModule(): TriggerModule | undefined;
    getResourceMonitor(): ResourceMonitor | null;
    /**
     * Initialize all modules
     */
    initialize(): Promise<void>;
    /**
     * Start the watcher service
     */
    start(): Promise<void>;
    /**
     * Stop the watcher service (graceful drain with configurable timeout)
     */
    stop(): Promise<void>;
    private waitForDrain;
    private beginTask;
    private endTask;
    /**
     * Whether the service is in drain mode
     */
    isDraining(): boolean;
    /**
     * Set up communication between modules
     * All file events are routed to the chain orchestrator for sequential processing.
     */
    private setupModuleCommunication;
    /**
     * Get service status
     */
    getStatus(): ServiceStatus;
    /**
     * Reload configuration for all modules
     */
    reloadConfig(): Promise<void>;
}
/**
 * Export for programmatic usage
 */
export default WatcherService;
//# sourceMappingURL=index.d.ts.map