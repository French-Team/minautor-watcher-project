/**
 * Main Watcher Service class that orchestrates all modules
 */
export declare class WatcherService {
    private detectionModule?;
    private preventionModule?;
    private triggerModule?;
    private config;
    constructor(config?: any);
    /**
     * Initialize all modules
     */
    initialize(): Promise<void>;
    /**
     * Start the watcher service
     */
    start(): Promise<void>;
    /**
     * Stop the watcher service
     */
    stop(): Promise<void>;
    /**
     * Set up communication between modules
     */
    private setupModuleCommunication;
    /**
     * Get service status
     */
    getStatus(): {
        initialized: boolean;
        running: boolean;
        modules: {
            detection?: any;
            prevention?: any;
            trigger?: any;
        };
    };
    /**
     * Reload configuration for all modules
     */
    reloadConfig(): Promise<void>;
}
/**
 * CLI interface for the Watcher Service
 */
export declare class WatcherCLI {
    private service;
    private program;
    constructor();
    private setupCLI;
    /**
     * Parse and execute CLI commands
     */
    run(): Promise<void>;
}
/**
 * Export for programmatic usage
 */
export default WatcherService;
//# sourceMappingURL=index.d.ts.map