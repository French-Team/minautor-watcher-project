/**
 * CLI interface for the Watcher Service
 */
export declare class WatcherCLI {
    private service;
    private program;
    constructor();
    private setupCLI;
    private setupStartCommand;
    private setupStopCommand;
    private setupStatusCommand;
    private setupReloadCommand;
    private setupTestCommand;
    private setupConfigCommand;
    private setupTestAllCommand;
    /**
     * Scan command — one-shot: detect, fix, inject, then exit
     */
    private setupScanCommand;
    /**
     * Find files matching given extensions recursively
     */
    private findFiles;
    /**
     * Analyze command — analyze project structure and evaluate adaptive rules
     */
    private setupAnalyzeCommand;
    private printMetrics;
    /**
     * Environment command — show environment report
     */
    private setupEnvCommand;
    /**
     * Doctor command — check environment and fix issues
     */
    private setupDoctorCommand;
    /**
     * Preview/dry-run command — show what corrections would be applied without writing
     */
    private setupPreviewCommand;
    /**
     * Parse and execute CLI commands
     */
    run(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map