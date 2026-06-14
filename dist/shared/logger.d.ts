import winston from "winston";
export interface WatcherLogger extends winston.Logger {
    success(message: string, ...meta: unknown[]): winston.Logger;
}
declare const _default: WatcherLogger;
export default _default;
export declare const createChildLogger: (moduleName: string) => WatcherLogger;
export declare const logFileOperation: (operation: string, filePath: string, details?: Record<string, unknown>) => void;
export declare const logError: (error: Error, context?: string) => void;
//# sourceMappingURL=logger.d.ts.map