import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  ConsoleNotifier,
  FileNotifier,
  NotifierRegistry,
  createNotifierRegistry,
  NotificationLevel,
  NotificationChannel,
  NotificationUtils,
} from "../../src/trigger/notifiers.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-notifiers");

describe("Notifiers", () => {
  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe("ConsoleNotifier", () => {
    it("should report success when enabled", async () => {
      const notifier = new ConsoleNotifier(true);
      const result = await notifier.send({
        title: "Test",
        message: "Test message",
        level: NotificationLevel.INFO,
        channel: NotificationChannel.CONSOLE,
      });
      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.CONSOLE);
    });

    it("should skip when disabled", async () => {
      const notifier = new ConsoleNotifier(false);
      const result = await notifier.send({
        title: "Test",
        message: "Test message",
        level: NotificationLevel.INFO,
        channel: NotificationChannel.CONSOLE,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("FileNotifier", () => {
    it("should write notifications to log file", async () => {
      const logPath = path.join(TEST_DIR, "notifications.log");
      const notifier = new FileNotifier(logPath, true);
      const result = await notifier.send({
        title: "Test",
        message: "Test message",
        level: NotificationLevel.INFO,
        channel: NotificationChannel.FILE,
        file: "/test/file.ts",
      });
      expect(result.success).toBe(true);

      const content = await fs.readFile(logPath, "utf-8");
      expect(content).toContain("Test");
      expect(content).toContain("Test message");
    });

    it("should skip when disabled", async () => {
      const logPath = path.join(TEST_DIR, "disabled.log");
      const notifier = new FileNotifier(logPath, false);
      const result = await notifier.send({
        title: "Test",
        message: "Test message",
        level: NotificationLevel.INFO,
        channel: NotificationChannel.FILE,
      });
      expect(result.success).toBe(true);
      const exists = await fs.pathExists(logPath);
      expect(exists).toBe(false);
    });
  });

  describe("NotifierRegistry", () => {
    it("should register and retrieve notifiers", () => {
      const registry = new NotifierRegistry();
      const notifier = new ConsoleNotifier(true);
      registry.register(NotificationChannel.CONSOLE, notifier);
      expect(registry.get(NotificationChannel.CONSOLE)).toBe(notifier);
    });

    it("should get all registered notifiers", () => {
      const registry = new NotifierRegistry();
      registry.register(NotificationChannel.CONSOLE, new ConsoleNotifier(true));
      registry.register(NotificationChannel.FILE, new FileNotifier());
      expect(registry.getAll()).toHaveLength(2);
    });

    it("should send to a specific channel", async () => {
      const registry = new NotifierRegistry();
      registry.register(NotificationChannel.CONSOLE, new ConsoleNotifier(true));
      const results = await registry.sendToChannels(
        [NotificationChannel.CONSOLE],
        {
          title: "Test",
          message: "Test message",
          level: NotificationLevel.INFO,
          channel: NotificationChannel.CONSOLE,
        }
      );
      expect(results[0].success).toBe(true);
    });

    it("should return error for unregistered channel", async () => {
      const registry = new NotifierRegistry();
      const result = await registry.sendToChannel(NotificationChannel.SLACK, {
        title: "Test",
        message: "Test message",
        level: NotificationLevel.INFO,
        channel: NotificationChannel.SLACK,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("createNotifierRegistry", () => {
    it("should create registry with all default notifiers", () => {
      const registry = createNotifierRegistry();
      expect(registry.get(NotificationChannel.SLACK)).toBeDefined();
      expect(registry.get(NotificationChannel.EMAIL)).toBeDefined();
      expect(registry.get(NotificationChannel.CONSOLE)).toBeDefined();
      expect(registry.get(NotificationChannel.FILE)).toBeDefined();
    });
  });

  describe("NotificationUtils", () => {
    it("should create file notification data", () => {
      const data = NotificationUtils.createFileNotification(
        "Test Title",
        "Test message",
        "/path/file.ts",
        NotificationLevel.INFO,
        { extra: "data" }
      );
      expect(data.title).toBe("Test Title");
      expect(data.message).toBe("Test message");
      expect(data.file).toBe("/path/file.ts");
      expect(data.level).toBe(NotificationLevel.INFO);
      expect(data.metadata).toEqual({ extra: "data" });
    });

    it("should create error notification data", () => {
      const error = new Error("Something broke");
      const data = NotificationUtils.createErrorNotification(
        "Error Title",
        error,
        "/path/file.ts",
        { ruleId: "test-rule" }
      );
      expect(data.title).toBe("Error Title");
      expect(data.message).toBe("Something broke");
      expect(data.level).toBe(NotificationLevel.ERROR);
      expect(data.file).toBe("/path/file.ts");
      expect(data.error).toBe(error);
    });

    it("should create correction notification data", () => {
      const data = NotificationUtils.createCorrectionNotification(
        "Correction Report",
        ["file1.ts", "file2.ts"],
        ["file3.ts"],
        { duration: 100 }
      );
      expect(data.title).toBe("Correction Report");
      expect(data.message).toContain("file1.ts");
      expect(data.message).toContain("file3.ts");
      expect(data.level).toBe(NotificationLevel.WARNING);
    });

    it("should create success correction notification when no failures", () => {
      const data = NotificationUtils.createCorrectionNotification(
        "All Good",
        ["file1.ts"],
        []
      );
      expect(data.level).toBe(NotificationLevel.SUCCESS);
    });
  });
});
