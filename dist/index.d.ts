import { PreventionModule } from "./prevention/index.js";
import { TriggerModule } from "./trigger/index.js";
import type { WatcherServiceConfig, ServiceMetrics, ServiceStatus } from "./types/common.js";
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
    private config;
    private isRunning;
    private draining;
    private activeTasks;
    private drainResolvers;
    private metrics;
    constructor(config?: WatcherServiceConfig);
    getMetrics(): ServiceMetrics;
    resetMetrics(): void;
    getPreventionModule(): PreventionModule | undefined;
    getTriggerModule(): TriggerModule | undefined;
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