import winston from "winston";
export interface WatcherLogger extends winston.Logger {
    success(message: string, ...meta: unknown[]): winston.Logger;
}
declare const _default: WatcherLogger;
export default _default;
export declare const createChildLogger: (moduleName: string) => WatcherLogger;
export declare const logFileOperation: (operation: string, filePath: string, details?: Record<string, unknown>) => void;
export declare const logError: (error: Error, context?: string) => void;
export declare function clearLogFiles(): Promise<void>;
/**
 * Write a header block at the top of all log files so each run
 * is clearly delimited and easy to analyze.
 */
export declare function writeLogHeader(options?: {
    targetDir?: string;
    fileCount?: number;
}): Promise<void>;
/**
 * Data for the final report written on shutdown / idle.
 */
export interface ReportData {
    startTime: string;
    endTime: string;
    targetDir?: string;
    fileCount?: number;
    filesProcessed?: number;
    filesCorrected?: number;
    filesFailed?: number;
    warningCount?: number;
    fixReportCount?: number;
    warningFileCount?: number;
    errorRules?: Record<string, number>;
    httpPort?: number;
    validation?: {
        eslint?: string | null;
        prettier?: string | null;
        hasPackageJson?: boolean;
        hasNodeModules?: boolean;
    };
    activeWarningsCount?: number;
}
/**
 * Write the final report to `logs/report.log`.
 * Francais, sans emoji, lisible par humain et agent.
 */
export declare function writeReport(data: ReportData): Promise<void>;
//# sourceMappingURL=logger.d.ts.map