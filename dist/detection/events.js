import EventEmitter from "events";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("detection-events");
/**
 * Custom event types for the detection module
 */
export var DetectionEvent;
(function (DetectionEvent) {
    // File system events
    DetectionEvent["FILE_DETECTED"] = "fileDetected";
    DetectionEvent["FILE_MODIFIED"] = "fileModified";
    DetectionEvent["FILE_DELETED"] = "fileDeleted";
    // Processing events
    DetectionEvent["PROCESSING_STARTED"] = "processingStarted";
    DetectionEvent["PROCESSING_COMPLETED"] = "processingCompleted";
    DetectionEvent["PROCESSING_FAILED"] = "processingFailed";
    // Batch events
    DetectionEvent["BATCH_STARTED"] = "batchStarted";
    DetectionEvent["BATCH_COMPLETED"] = "batchCompleted";
    // Error events
    DetectionEvent["DETECTION_ERROR"] = "detectionError";
    DetectionEvent["VALIDATION_ERROR"] = "validationError";
})(DetectionEvent || (DetectionEvent = {}));
/**
 * Event bus for the detection module
 * Extends EventEmitter to provide typed events and better error handling
 */
export class DetectionEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // Increase default limit for multiple listeners
    }
    /**
     * Emit file detected event
     */
    emitFileDetected(file, source = "watcher") {
        const event = { file, source };
        logger.debug(`Emitting FILE_DETECTED: ${file.filePath}`);
        this.emit(DetectionEvent.FILE_DETECTED, event);
    }
    /**
     * Emit file modified event
     */
    emitFileModified(file) {
        logger.debug(`Emitting FILE_MODIFIED: ${file.filePath}`);
        this.emit(DetectionEvent.FILE_MODIFIED, { file });
    }
    /**
     * Emit file deleted event
     */
    emitFileDeleted(file) {
        logger.debug(`Emitting FILE_DELETED: ${file.filePath}`);
        this.emit(DetectionEvent.FILE_DELETED, { file });
    }
    /**
     * Emit processing started event
     */
    emitProcessingStarted(file, processor) {
        const event = {
            file,
            processor,
            startTime: new Date(),
        };
        logger.debug(`Emitting PROCESSING_STARTED: ${file.filePath} by ${processor}`);
        this.emit(DetectionEvent.PROCESSING_STARTED, event);
    }
    /**
     * Emit processing completed event
     */
    emitProcessingCompleted(file, processor, metadata) {
        const endTime = new Date();
        const duration = endTime.getTime() - file.timestamp.getTime();
        const event = {
            file,
            processor,
            startTime: file.timestamp,
            endTime,
            duration,
            success: true,
            metadata,
        };
        logger.debug(`Emitting PROCESSING_COMPLETED: ${file.filePath} by ${processor} (${duration}ms)`);
        this.emit(DetectionEvent.PROCESSING_COMPLETED, event);
    }
    /**
     * Emit processing failed event
     */
    emitProcessingFailed(file, processor, error, metadata) {
        const endTime = new Date();
        const duration = endTime.getTime() - file.timestamp.getTime();
        const event = {
            file,
            processor,
            startTime: file.timestamp,
            endTime,
            duration,
            success: false,
            error,
            metadata,
        };
        logger.warn(`Emitting PROCESSING_FAILED: ${file.filePath} by ${processor}: ${error.message}`);
        this.emit(DetectionEvent.PROCESSING_FAILED, event);
    }
    /**
     * Emit batch started event
     */
    emitBatchStarted(files) {
        const event = {
            files,
            totalCount: files.length,
            processedCount: 0,
            failedCount: 0,
            startTime: new Date(),
        };
        logger.info(`Emitting BATCH_STARTED: ${files.length} files`);
        this.emit(DetectionEvent.BATCH_STARTED, event);
    }
    /**
     * Emit batch completed event
     */
    emitBatchCompleted(totalCount, processedCount, failedCount, duration) {
        const event = {
            files: [],
            totalCount,
            processedCount,
            failedCount,
            startTime: new Date(Date.now() - duration),
            endTime: new Date(),
            duration,
        };
        logger.info(`Emitting BATCH_COMPLETED: ${processedCount}/${totalCount} processed, ${failedCount} failed (${duration}ms)`);
        this.emit(DetectionEvent.BATCH_COMPLETED, event);
    }
    /**
     * Emit detection error event
     */
    emitDetectionError(error, context, file) {
        const event = {
            error,
            context,
            file,
            timestamp: new Date(),
        };
        logger.error(`Emitting DETECTION_ERROR in ${context}: ${error.message}`);
        this.emit(DetectionEvent.DETECTION_ERROR, event);
    }
    /**
     * Emit validation error event
     */
    emitValidationError(error, file) {
        const event = {
            error,
            context: "validation",
            file,
            timestamp: new Date(),
        };
        logger.warn(`Emitting VALIDATION_ERROR: ${error.message}`);
        this.emit(DetectionEvent.VALIDATION_ERROR, event);
    }
}
/**
 * Global event bus instance
 */
export const eventBus = new DetectionEventBus();
/**
 * Utility functions for event handling
 */
export class EventUtils {
    /**
     * Create a typed event listener
     */
    static createListener(event, handler) {
        return handler;
    }
    /**
     * Wrap async event handler with error handling
     */
    static wrapAsyncHandler(handler) {
        return async (data) => {
            try {
                await handler(data);
            }
            catch (error) {
                logger.error("Error in async event handler:", error);
                // Re-emit as detection error if possible
                if (eventBus.listenerCount(DetectionEvent.DETECTION_ERROR) > 0) {
                    eventBus.emitDetectionError(error instanceof Error ? error : new Error(String(error)), "event_handler");
                }
            }
        };
    }
    /**
     * Create a debounced event handler
     */
    static debounce(handler, delay) {
        let timeoutId = null;
        return (data) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                handler(data);
                timeoutId = null;
            }, delay);
        };
    }
}
/**
 * Event handler decorators for cleaner code
 */
export function OnEvent(event) {
    return function (target, propertyKey, descriptor) {
        const method = descriptor.value;
        // Register the method as an event listener
        process.nextTick(() => {
            eventBus.on(event, method.bind(target));
        });
        return descriptor;
    };
}
export default DetectionEventBus;
//# sourceMappingURL=events.js.map