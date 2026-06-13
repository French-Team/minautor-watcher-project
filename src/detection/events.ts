import EventEmitter from "events";
import { FileEvent } from "./filters.js";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("detection-events");

/**
 * Custom event types for the detection module
 */
export enum DetectionEvent {
  // File system events
  FILE_DETECTED = "fileDetected",
  FILE_MODIFIED = "fileModified",
  FILE_DELETED = "fileDeleted",

  // Processing events
  PROCESSING_STARTED = "processingStarted",
  PROCESSING_COMPLETED = "processingCompleted",
  PROCESSING_FAILED = "processingFailed",

  // Batch events
  BATCH_STARTED = "batchStarted",
  BATCH_COMPLETED = "batchCompleted",

  // Error events
  DETECTION_ERROR = "detectionError",
  VALIDATION_ERROR = "validationError",
}

/**
 * Event data structures
 */
export interface FileDetectedEvent {
  file: FileEvent;
  source: "watcher" | "scan";
}

export interface ProcessingEvent {
  file: FileEvent;
  processor: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  success?: boolean;
  error?: Error;
  metadata?: Record<string, unknown>;
}

export interface BatchEvent {
  files: FileEvent[];
  totalCount: number;
  processedCount: number;
  failedCount: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export interface DetectionErrorEvent {
  error: Error;
  context: string;
  file?: FileEvent;
  timestamp: Date;
}

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
  emitFileDetected(
    file: FileEvent,
    source: "watcher" | "scan" = "watcher"
  ): void {
    const event: FileDetectedEvent = { file, source };
    logger.debug(`Emitting FILE_DETECTED: ${file.filePath}`);
    this.emit(DetectionEvent.FILE_DETECTED, event);
  }

  /**
   * Emit file modified event
   */
  emitFileModified(file: FileEvent): void {
    logger.debug(`Emitting FILE_MODIFIED: ${file.filePath}`);
    this.emit(DetectionEvent.FILE_MODIFIED, { file });
  }

  /**
   * Emit file deleted event
   */
  emitFileDeleted(file: FileEvent): void {
    logger.debug(`Emitting FILE_DELETED: ${file.filePath}`);
    this.emit(DetectionEvent.FILE_DELETED, { file });
  }

  /**
   * Emit processing started event
   */
  emitProcessingStarted(file: FileEvent, processor: string): void {
    const event: ProcessingEvent = {
      file,
      processor,
      startTime: new Date(),
    };
    logger.debug(
      `Emitting PROCESSING_STARTED: ${file.filePath} by ${processor}`
    );
    this.emit(DetectionEvent.PROCESSING_STARTED, event);
  }

  /**
   * Emit processing completed event
   */
  emitProcessingCompleted(
    file: FileEvent,
    processor: string,
    metadata?: Record<string, unknown>
  ): void {
    const endTime = new Date();
    const duration = endTime.getTime() - file.timestamp.getTime();

    const event: ProcessingEvent = {
      file,
      processor,
      startTime: file.timestamp,
      endTime,
      duration,
      success: true,
      metadata,
    };

    logger.debug(
      `Emitting PROCESSING_COMPLETED: ${file.filePath} by ${processor} (${duration}ms)`
    );
    this.emit(DetectionEvent.PROCESSING_COMPLETED, event);
  }

  /**
   * Emit processing failed event
   */
  emitProcessingFailed(
    file: FileEvent,
    processor: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): void {
    const endTime = new Date();
    const duration = endTime.getTime() - file.timestamp.getTime();

    const event: ProcessingEvent = {
      file,
      processor,
      startTime: file.timestamp,
      endTime,
      duration,
      success: false,
      error,
      metadata,
    };

    logger.warn(
      `Emitting PROCESSING_FAILED: ${file.filePath} by ${processor}: ${error.message}`
    );
    this.emit(DetectionEvent.PROCESSING_FAILED, event);
  }

  /**
   * Emit batch started event
   */
  emitBatchStarted(files: FileEvent[]): void {
    const event: BatchEvent = {
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
  emitBatchCompleted(
    totalCount: number,
    processedCount: number,
    failedCount: number,
    duration: number
  ): void {
    const event: BatchEvent = {
      files: [],
      totalCount,
      processedCount,
      failedCount,
      startTime: new Date(Date.now() - duration),
      endTime: new Date(),
      duration,
    };

    logger.info(
      `Emitting BATCH_COMPLETED: ${processedCount}/${totalCount} processed, ${failedCount} failed (${duration}ms)`
    );
    this.emit(DetectionEvent.BATCH_COMPLETED, event);
  }

  /**
   * Emit detection error event
   */
  emitDetectionError(error: Error, context: string, file?: FileEvent): void {
    const event: DetectionErrorEvent = {
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
  emitValidationError(error: Error, file?: FileEvent): void {
    const event: DetectionErrorEvent = {
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
  static createListener<T>(
    event: DetectionEvent,
    handler: (data: T) => void | Promise<void>
  ): (data: T) => void | Promise<void> {
    return handler;
  }

  /**
   * Wrap async event handler with error handling
   */
  static wrapAsyncHandler<T>(
    handler: (data: T) => Promise<void>
  ): (data: T) => Promise<void> {
    return async (data: T) => {
      try {
        await handler(data);
      } catch (error) {
        logger.error("Error in async event handler:", error);
        // Re-emit as detection error if possible
        if (eventBus.listenerCount(DetectionEvent.DETECTION_ERROR) > 0) {
          eventBus.emitDetectionError(
            error instanceof Error ? error : new Error(String(error)),
            "event_handler"
          );
        }
      }
    };
  }

  /**
   * Create a debounced event handler
   */
  static debounce<T>(
    handler: (data: T) => void,
    delay: number
  ): (data: T) => void {
    let timeoutId: NodeJS.Timeout | null = null;

    return (data: T) => {
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
export function OnEvent(event: DetectionEvent) {
  return function (
    target: Record<string, (...args: never[]) => unknown>,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;

    // Register the method as an event listener
    process.nextTick(() => {
      eventBus.on(event, method.bind(target));
    });

    return descriptor;
  };
}

export default DetectionEventBus;
