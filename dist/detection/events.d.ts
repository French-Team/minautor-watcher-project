import EventEmitter from "events";
import { FileEvent } from "./filters.js";
/**
 * Custom event types for the detection module
 */
export declare enum DetectionEvent {
    FILE_DETECTED = "fileDetected",
    FILE_MODIFIED = "fileModified",
    FILE_DELETED = "fileDeleted",
    PROCESSING_STARTED = "processingStarted",
    PROCESSING_COMPLETED = "processingCompleted",
    PROCESSING_FAILED = "processingFailed",
    BATCH_STARTED = "batchStarted",
    BATCH_COMPLETED = "batchCompleted",
    DETECTION_ERROR = "detectionError",
    VALIDATION_ERROR = "validationError"
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
export declare class DetectionEventBus extends EventEmitter {
    constructor();
    /**
     * Emit file detected event
     */
    emitFileDetected(file: FileEvent, source?: "watcher" | "scan"): void;
    /**
     * Emit file modified event
     */
    emitFileModified(file: FileEvent): void;
    /**
     * Emit file deleted event
     */
    emitFileDeleted(file: FileEvent): void;
    /**
     * Emit processing started event
     */
    emitProcessingStarted(file: FileEvent, processor: string): void;
    /**
     * Emit processing completed event
     */
    emitProcessingCompleted(file: FileEvent, processor: string, metadata?: Record<string, unknown>): void;
    /**
     * Emit processing failed event
     */
    emitProcessingFailed(file: FileEvent, processor: string, error: Error, metadata?: Record<string, unknown>): void;
    /**
     * Emit batch started event
     */
    emitBatchStarted(files: FileEvent[]): void;
    /**
     * Emit batch completed event
     */
    emitBatchCompleted(totalCount: number, processedCount: number, failedCount: number, duration: number): void;
    /**
     * Emit detection error event
     */
    emitDetectionError(error: Error, context: string, file?: FileEvent): void;
    /**
     * Emit validation error event
     */
    emitValidationError(error: Error, file?: FileEvent): void;
}
/**
 * Global event bus instance
 */
export declare const eventBus: DetectionEventBus;
/**
 * Utility functions for event handling
 */
export declare class EventUtils {
    /**
     * Create a typed event listener
     */
    static createListener<T>(event: DetectionEvent, handler: (data: T) => void | Promise<void>): (data: T) => void | Promise<void>;
    /**
     * Wrap async event handler with error handling
     */
    static wrapAsyncHandler<T>(handler: (data: T) => Promise<void>): (data: T) => Promise<void>;
    /**
     * Create a debounced event handler
     */
    static debounce<T>(handler: (data: T) => void, delay: number): (data: T) => void;
}
/**
 * Event handler decorators for cleaner code
 */
export declare function OnEvent(event: DetectionEvent): (target: Record<string, (...args: never[]) => unknown>, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export default DetectionEventBus;
//# sourceMappingURL=events.d.ts.map