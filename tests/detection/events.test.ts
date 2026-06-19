import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  DetectionEventBus,
  DetectionEvent,
  trackListener,
  cleanupAllListeners,
  eventBus,
} from "../../src/detection/events.js";

describe("DetectionEventBus", () => {
  let bus: DetectionEventBus;

  beforeEach(() => {
    bus = new DetectionEventBus();
  });

  afterEach(() => {
    bus.removeAllListeners();
  });

  describe("emitFileDetected", () => {
    it("should emit FILE_DETECTED event with file data", () => {
      const received: unknown[] = [];
      bus.on(DetectionEvent.FILE_DETECTED, (data: unknown) =>
        received.push(data)
      );

      bus.emitFileDetected({
        filePath: "/test/file.ts",
        relativePath: "file.ts",
        extension: "ts",
        timestamp: new Date(),
      });

      expect(received).toHaveLength(1);
      expect(
        (received[0] as { file: { filePath: string } }).file.filePath
      ).toBe("/test/file.ts");
    });
  });

  describe("emitFileModified", () => {
    it("should emit FILE_MODIFIED event", () => {
      const received: unknown[] = [];
      bus.on(DetectionEvent.FILE_MODIFIED, (data: unknown) =>
        received.push(data)
      );

      bus.emitFileModified({
        filePath: "/test/file.ts",
        relativePath: "file.ts",
        extension: "ts",
        timestamp: new Date(),
      });

      expect(received).toHaveLength(1);
    });
  });

  describe("emitFileDeleted", () => {
    it("should emit FILE_DELETED event", () => {
      const received: unknown[] = [];
      bus.on(DetectionEvent.FILE_DELETED, (data: unknown) =>
        received.push(data)
      );

      bus.emitFileDeleted({
        filePath: "/test/file.ts",
        relativePath: "file.ts",
        extension: "ts",
        timestamp: new Date(),
      });

      expect(received).toHaveLength(1);
    });
  });

  describe("emitProcessingCompleted", () => {
    it("should include duration in event", () => {
      const received: unknown[] = [];
      bus.on(DetectionEvent.PROCESSING_COMPLETED, (data: unknown) =>
        received.push(data)
      );

      const past = new Date(Date.now() - 100);
      bus.emitProcessingCompleted(
        {
          filePath: "/test/file.ts",
          relativePath: "file.ts",
          extension: "ts",
          timestamp: past,
        },
        "test-processor"
      );

      expect(received).toHaveLength(1);
      const event = received[0] as { duration?: number };
      expect(event.duration).toBeGreaterThanOrEqual(90);
    });
  });

  describe("emitBatchCompleted", () => {
    it("should emit batch stats", () => {
      const received: unknown[] = [];
      bus.on(DetectionEvent.BATCH_COMPLETED, (data: unknown) =>
        received.push(data)
      );

      bus.emitBatchCompleted(10, 8, 2, 500);

      expect(received).toHaveLength(1);
      const event = received[0] as {
        totalCount: number;
        processedCount: number;
        failedCount: number;
      };
      expect(event.totalCount).toBe(10);
      expect(event.processedCount).toBe(8);
      expect(event.failedCount).toBe(2);
    });
  });
});

describe("trackListener / cleanupAllListeners (V5.9)", () => {
  let savedListeners: Array<{ event: string; listener: () => void }> = [];

  beforeEach(() => {
    cleanupAllListeners();
    savedListeners = [];
  });

  afterEach(() => {
    // Clean up any listeners we added to the global eventBus
    for (const { event, listener } of savedListeners) {
      eventBus.removeListener(event, listener);
    }
    cleanupAllListeners();
  });

  it("should register listener on global eventBus via trackListener", () => {
    let called = false;
    const listener = () => {
      called = true;
    };

    trackListener(DetectionEvent.FILE_DETECTED, listener);
    savedListeners.push({
      event: DetectionEvent.FILE_DETECTED,
      listener: listener as () => void,
    });

    eventBus.emit(DetectionEvent.FILE_DETECTED, {});

    expect(called).toBe(true);
  });

  it("should register multiple listeners for different events", () => {
    const calls: string[] = [];

    const listener1 = () => calls.push("detected");
    const listener2 = () => calls.push("modified");

    trackListener(DetectionEvent.FILE_DETECTED, listener1);
    trackListener(DetectionEvent.FILE_MODIFIED, listener2);
    savedListeners.push({
      event: DetectionEvent.FILE_DETECTED,
      listener: listener1,
    });
    savedListeners.push({
      event: DetectionEvent.FILE_MODIFIED,
      listener: listener2,
    });

    eventBus.emit(DetectionEvent.FILE_DETECTED, {});
    eventBus.emit(DetectionEvent.FILE_MODIFIED, {});

    expect(calls).toContain("detected");
    expect(calls).toContain("modified");
  });

  it("should remove all tracked listeners on cleanupAllListeners", () => {
    const calls: string[] = [];

    const listener1 = () => calls.push("a");
    const listener2 = () => calls.push("b");

    trackListener(DetectionEvent.FILE_DETECTED, listener1);
    trackListener(DetectionEvent.FILE_DETECTED, listener2);

    cleanupAllListeners();

    eventBus.emit(DetectionEvent.FILE_DETECTED, {});

    expect(calls).toHaveLength(0);
  });

  it("should not affect untracked listeners on cleanup", () => {
    const calls: string[] = [];

    const untracked = () => calls.push("untracked");
    eventBus.on(DetectionEvent.FILE_DETECTED, untracked);
    savedListeners.push({
      event: DetectionEvent.FILE_DETECTED,
      listener: untracked,
    });

    const tracked = () => calls.push("tracked");
    trackListener(DetectionEvent.FILE_DETECTED, tracked);

    cleanupAllListeners();

    eventBus.emit(DetectionEvent.FILE_DETECTED, {});

    // Only untracked listener should remain
    expect(calls).toEqual(["untracked"]);
  });

  it("should be safe to call cleanup when no listeners registered", () => {
    expect(() => cleanupAllListeners()).not.toThrow();
  });

  it("should be safe to call cleanup multiple times", () => {
    const listener = () => {};
    trackListener(DetectionEvent.FILE_DETECTED, listener);
    savedListeners.push({
      event: DetectionEvent.FILE_DETECTED,
      listener,
    });

    expect(() => {
      cleanupAllListeners();
      cleanupAllListeners();
    }).not.toThrow();
  });
});

describe("EventUtils", () => {
  it("wrapAsyncHandler should catch errors", async () => {
    const { EventUtils } = await import("../../src/detection/events.js");

    const handler = EventUtils.wrapAsyncHandler(async () => {
      throw new Error("test error");
    });

    // Should not throw
    await expect(handler({} as never)).resolves.toBeUndefined();
  });

  it("debounce should debounce rapid calls", async () => {
    const { EventUtils } = await import("../../src/detection/events.js");
    let callCount = 0;

    const debounced = EventUtils.debounce(() => {
      callCount++;
    }, 50);

    debounced({} as never);
    debounced({} as never);
    debounced({} as never);

    expect(callCount).toBe(0);

    await new Promise((r) => setTimeout(r, 60));
    expect(callCount).toBe(1);
  });
});
