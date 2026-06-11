import winston from 'winston';
declare const logger: winston.Logger;
export default logger;
export declare const createChildLogger: (moduleName: string) => winston.Logger;
export declare const logFileOperation: (operation: string, filePath: string, details?: any) => void;
export declare const logError: (error: Error, context?: string) => void;
//# sourceMappingURL=logger.d.ts.map