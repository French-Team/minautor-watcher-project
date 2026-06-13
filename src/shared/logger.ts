import winston from "winston";
import path from "path";

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for different log levels
const logColors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(logColors);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let metaStr = "";
      if (Object.keys(meta).length > 0) {
        metaStr = `\n${JSON.stringify(meta, null, 2)}`;
      }
      return `${timestamp} ${level}: ${message}${metaStr}`;
    })
  ),
  defaultMeta: { service: "watcher-service" },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "error.log"),
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "combined.log"),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// If we're not in production then log to the console
if (process.env.NODE_ENV !== "production") {
  const logFormat =
    process.env.LOG_FORMAT === "json"
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level}: ${message}`;
          })
        );

  logger.add(
    new winston.transports.Console({
      format: logFormat,
    })
  );
}

export default logger;

// Export additional utility functions
export const createChildLogger = (moduleName: string) => {
  return logger.child({ module: moduleName });
};

export const logFileOperation = (
  operation: string,
  filePath: string,
  details?: Record<string, unknown>
) => {
  logger.info(`File ${operation}: ${filePath}`, details);
};

export const logError = (error: Error, context?: string) => {
  logger.error(`Error${context ? ` in ${context}` : ""}: ${error.message}`, {
    stack: error.stack,
    name: error.name,
  });
};
