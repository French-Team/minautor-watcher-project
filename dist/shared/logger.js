import winston from "winston";
import chalk from "chalk";
import path from "path";
// Force chalk to always produce ANSI colors (logger targets console)
chalk.level = 2;
// Define log levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    success: 3,
    http: 4,
    debug: 5,
};
// Define colors for file logs (plain text, no ANSI)
const logColors = {
    error: "red",
    warn: "yellow",
    info: "green",
    success: "green",
    http: "magenta",
    debug: "white",
};
winston.addColors(logColors);
// Level color map for console (chalk)
const levelColorMap = {
    error: chalk.red,
    warn: chalk.hex("#FFA500"), // orange
    info: chalk.hex("#D3D3D3"), // gris pale (light gray)
    success: chalk.hex("#ADFF2F"), // vert citron / lime green
    http: chalk.hex("#FFB6C1"), // rose (light pink)
    debug: chalk.white,
};
// Custom console format with chalk-based coloring
const chalkFormat = winston.format((info) => {
    const colorFn = levelColorMap[info.level] || ((s) => s);
    info.level = colorFn(info.level);
    if (typeof info.message === "string") {
        info.message = colorFn(info.message);
    }
    return info;
});
// Create the logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "success",
    levels: logLevels,
    format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }), winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = "";
        if (Object.keys(meta).length > 0) {
            metaStr = `\n${JSON.stringify(meta, null, 2)}`;
        }
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })),
    defaultMeta: { service: "watcher-service" },
    transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({
            filename: path.join(process.cwd(), "logs", "error.log"),
            level: "error",
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }),
        // Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({
            filename: path.join(process.cwd(), "logs", "combined.log"),
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }),
    ],
});
// If we're not in production then log to the console
if (process.env.NODE_ENV !== "production") {
    const logFormat = process.env.LOG_FORMAT === "json"
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(chalkFormat(), winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level}: ${message}`;
        }));
    logger.add(new winston.transports.Console({
        format: logFormat,
    }));
}
export default logger;
// Export additional utility functions
export const createChildLogger = (moduleName) => {
    return logger.child({ module: moduleName });
};
export const logFileOperation = (operation, filePath, details) => {
    logger.info(`File ${operation}: ${filePath}`, details);
};
export const logError = (error, context) => {
    logger.error(`Error${context ? ` in ${context}` : ""}: ${error.message}`, {
        stack: error.stack,
        name: error.name,
    });
};
//# sourceMappingURL=logger.js.map