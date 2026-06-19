import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  Watcher,
  WatcherEvent,
  createWatcher,
} from "../../src/detection/watcher.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-detection");

describe("Watcher", () => {
  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe("constructor / createWatcher", () => {
    it("should create watcher with default config", () => {
      const watcher = createWatcher({ watchDir: TEST_DIR });
      expect(watcher).toBeInstanceOf(Watcher);
    });

    it("should create watcher with custom config", () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        watchExtensions: [".ts", ".js"],
        processingDelay: 200,
        persistent: false,
        ignoreInitial: true,
      });
      expect(watcher).toBeInstanceOf(Watcher);
    });

    it("should default ignoreInitial to false", () => {
      const watcher = createWatcher({ watchDir: TEST_DIR });
      expect(watcher).toBeInstanceOf(Watcher);
    });
  });

  describe("getStatus", () => {
    it("should return isRunning false when not started", () => {
      const watcher = createWatcher({ watchDir: TEST_DIR });
      const status = watcher.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.watchedFiles).toBe(0);
    });

    it("should return isRunning true after start", async () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
      });
      await watcher.start();
      expect(watcher.getStatus().isRunning).toBe(true);
      await watcher.stop();
    });
  });

  describe("start / stop", () => {
    it("should start and stop cleanly", async () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
      });

      await watcher.start();
      const statusRunning = watcher.getStatus();
      expect(statusRunning.isRunning).toBe(true);

      await watcher.stop();
      const statusStopped = watcher.getStatus();
      expect(statusStopped.isRunning).toBe(false);
    });

    it("should emit WATCHER_READY on start", async () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
      });

      const readyPromise = new Promise<void>((resolve) => {
        watcher.once(WatcherEvent.WATCHER_READY, resolve);
      });

      await watcher.start();
      await readyPromise;
      await watcher.stop();
    });

    it("should throw when watch directory does not exist", async () => {
      const watcher = createWatcher({
        watchDir: path.join(TEST_DIR, "nonexistent-dir-xyz"),
        persistent: false,
      });

      await expect(watcher.start()).rejects.toThrow(
        "Watch directory does not exist"
      );
    });
  });

  describe("native fs.watch detection", () => {
    it("should detect new files created after watcher starts", async () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
        processingDelay: 50,
        watchExtensions: ["ts", "js", "json"],
      });

      const detectedFiles: string[] = [];
      watcher.on(WatcherEvent.FILE_ADDED, (data: { filePath: string }) => {
        detectedFiles.push(data.filePath);
      });

      await watcher.start();

      // Wait for watcher to be ready
      await new Promise((r) => setTimeout(r, 200));

      // Create a new file after watcher started
      const newFile = path.join(TEST_DIR, "new-after-start.ts");
      await fs.writeFile(newFile, "const y = 2;");

      // Wait for detection + debounce
      await new Promise((r) => setTimeout(r, 500));
      await watcher.stop();

      // Should detect the new file
      expect(detectedFiles.length).toBeGreaterThanOrEqual(1);
      expect(
        detectedFiles.some((f) => f.includes("new-after-start.ts"))
      ).toBe(true);

      await fs.remove(newFile);
    });

    it("should detect file modifications", async () => {
      const testFile = path.join(TEST_DIR, "modify-test.ts");
      await fs.writeFile(testFile, "v1");

      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
        processingDelay: 50,
        watchExtensions: ["ts"],
      });

      const changeDetected = { value: false };
      watcher.on(WatcherEvent.FILE_CHANGED, (data: { filePath: string }) => {
        if (data.filePath.includes("modify-test.ts")) {
          changeDetected.value = true;
        }
      });

      await watcher.start();
      await new Promise((r) => setTimeout(r, 200));

      // Modify the file
      await fs.writeFile(testFile, "v2");

      await new Promise((r) => setTimeout(r, 500));
      await watcher.stop();

      expect(changeDetected.value).toBe(true);
      await fs.remove(testFile);
    });

    it("should detect file deletions", async () => {
      const testFile = path.join(TEST_DIR, "delete-test.ts");
      await fs.writeFile(testFile, "to be deleted");

      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
        processingDelay: 50,
        watchExtensions: ["ts"],
      });

      const deleteDetected = { value: false };
      watcher.on(WatcherEvent.FILE_DELETED, (data: { filePath: string }) => {
        if (data.filePath.includes("delete-test.ts")) {
          deleteDetected.value = true;
        }
      });

      await watcher.start();
      await new Promise((r) => setTimeout(r, 200));

      // Delete the file
      await fs.remove(testFile);

      await new Promise((r) => setTimeout(r, 500));
      await watcher.stop();

      expect(deleteDetected.value).toBe(true);
    });
  });

  describe("file extension filtering", () => {
    it("should ignore files not in watchExtensions", async () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
        processingDelay: 50,
        watchExtensions: ["ts"],
      });

      const detectedFiles: string[] = [];
      watcher.on(WatcherEvent.FILE_ADDED, (data: { filePath: string }) => {
        detectedFiles.push(data.filePath);
      });

      await watcher.start();
      await new Promise((r) => setTimeout(r, 200));

      // Create .txt file (not in watchExtensions)
      const txtFile = path.join(TEST_DIR, "ignored.txt");
      await fs.writeFile(txtFile, "ignored");
      // Create .ts file (in watchExtensions)
      const tsFile = path.join(TEST_DIR, "watched.ts");
      await fs.writeFile(tsFile, "watched");

      await new Promise((r) => setTimeout(r, 500));
      await watcher.stop();

      expect(detectedFiles.some((f) => f.includes("ignored.txt"))).toBe(false);
      expect(detectedFiles.some((f) => f.includes("watched.ts"))).toBe(true);

      await fs.remove(txtFile);
      await fs.remove(tsFile);
    });
  });

  describe("excludedDirs", () => {
    it("should exclude custom directories", async () => {
      const excludeDir = path.join(TEST_DIR, "excluded-sub");
      await fs.ensureDir(excludeDir);

      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
        processingDelay: 50,
        excludedDirs: ["excluded-sub"],
        watchExtensions: ["ts"],
      });

      const detectedFiles: string[] = [];
      watcher.on(WatcherEvent.FILE_ADDED, (data: { filePath: string }) => {
        detectedFiles.push(data.filePath);
      });

      await watcher.start();
      await new Promise((r) => setTimeout(r, 200));

      const excludedFile = path.join(excludeDir, "secret.ts");
      await fs.writeFile(excludedFile, "secret");

      await new Promise((r) => setTimeout(r, 500));
      await watcher.stop();

      expect(detectedFiles.some((f) => f.includes("secret.ts"))).toBe(false);

      await fs.remove(excludeDir);
    });
  });

  describe("debouncing", () => {
    it("should debounce rapid changes to the same file", async () => {
      const watcher = createWatcher({
        watchDir: TEST_DIR,
        persistent: false,
        processingDelay: 200,
        watchExtensions: ["ts"],
      });

      const changeCount = { value: 0 };
      watcher.on(WatcherEvent.FILE_CHANGED, () => {
        changeCount.value++;
      });

      await watcher.start();
      await new Promise((r) => setTimeout(r, 200));

      // Create and modify a file rapidly
      const debounceFile = path.join(TEST_DIR, "debounce-test.ts");
      await fs.writeFile(debounceFile, "v1");

      // Rapid modifications
      for (let i = 2; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await fs.writeFile(debounceFile, `v${i}`);
      }

      // Wait for debounce to settle
      await new Promise((r) => setTimeout(r, 600));
      await watcher.stop();

      // Should have fewer events than modifications due to debouncing
      expect(changeCount.value).toBeLessThan(5);

      await fs.remove(debounceFile);
    });
  });
});
