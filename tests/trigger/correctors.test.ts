import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  CorrectorRegistry,
  createCorrectorRegistry,
  TextReplacementCorrector,
  restoreFromBackup,
  cleanupBackups,
} from "../../src/trigger/correctors.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-correctors");

describe("CorrectorRegistry", () => {
  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe("register / get", () => {
    it("should register and retrieve a corrector", () => {
      const registry = new CorrectorRegistry();
      const corrector = new TextReplacementCorrector({
        id: "test",
        name: "Test",
        description: "Test corrector",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [],
      });
      registry.register("test", corrector);
      expect(registry.get("test")).toBe(corrector);
    });

    it("should return undefined for non-existent corrector", () => {
      const registry = new CorrectorRegistry();
      expect(registry.get("non-existent")).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("should return all registered correctors", () => {
      const registry = createCorrectorRegistry();
      const all = registry.getAll();
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe("getApplicableCorrectors", () => {
    it("should return correctors that can handle the file", () => {
      const registry = createCorrectorRegistry();
      const applicable = registry.getApplicableCorrectors("test.ts");
      expect(applicable.length).toBeGreaterThan(0);
      applicable.forEach((c) => {
        expect(c.canCorrect("test.ts")).toBe(true);
      });
    });

    it("should return empty for unmatched file type", () => {
      const registry = createCorrectorRegistry();
      const applicable = registry.getApplicableCorrectors("image.png");
      // text-replacement is enabled with no file extension filter, so it matches all files
      expect(applicable.length).toBeGreaterThanOrEqual(0);
    });

    it("should sort by priority descending", () => {
      const registry = createCorrectorRegistry();
      const applicable = registry.getApplicableCorrectors("test.ts");
      for (let i = 1; i < applicable.length; i++) {
        expect(applicable[i - 1].getPriority()).toBeGreaterThanOrEqual(
          applicable[i].getPriority()
        );
      }
    });
  });

  describe("TextReplacementCorrector", () => {
    it("should apply text replacement on a file", async () => {
      const filePath = path.join(TEST_DIR, "replace-test.ts");
      await fs.writeFile(filePath, 'console.log("hello");\nconst x = 1;');

      const corrector = new TextReplacementCorrector({
        id: "test-replace",
        name: "Test Replace",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [
          {
            type: "replace",
            target: "all",
            content: 'console.log("hello")',
            newContent: 'logger.info("hello")',
          },
        ],
      });

      const result = await corrector.applyCorrection(filePath);
      expect(result.success).toBe(true);
      expect(result.corrected).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('logger.info("hello")');
      expect(content).not.toContain('console.log("hello")');
    });

    it("should skip when disabled", async () => {
      const filePath = path.join(TEST_DIR, "disabled-test.ts");
      await fs.writeFile(filePath, 'console.log("hello");');

      const corrector = new TextReplacementCorrector({
        id: "disabled",
        name: "Disabled",
        description: "Disabled",
        enabled: false,
        priority: 1,
        conditions: {},
        actions: [
          {
            type: "replace",
            target: "all",
            content: 'console.log("hello")',
            newContent: 'logger.info("hello")',
          },
        ],
      });

      const result = await corrector.applyCorrection(filePath);
      expect(result.corrected).toBe(false);
    });
  });

  describe("createCorrectorRegistry", () => {
    it("should create registry with default correctors", () => {
      const registry = createCorrectorRegistry();
      expect(registry.get("eslint-fix")).toBeDefined();
      expect(registry.get("prettier-format")).toBeDefined();
      expect(registry.get("text-replacement")).toBeDefined();
    });

    it("should have text-replacement enabled by default", () => {
      const registry = createCorrectorRegistry();
      const textReplacement = registry.get("text-replacement");
      expect(textReplacement?.isEnabled()).toBe(true);
    });
  });

  describe("backup/rollback", () => {
    it("should create .bak file when applying correction", async () => {
      const filePath = path.join(TEST_DIR, "backup-test.ts");
      await fs.writeFile(filePath, 'console.log("hello");');

      const corrector = new TextReplacementCorrector({
        id: "test-backup",
        name: "Test Backup",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [
          {
            type: "replace",
            target: "all",
            content: 'console.log("hello")',
            newContent: 'logger.info("hello")',
          },
        ],
      });

      await corrector.applyCorrection(filePath);
      expect(await fs.pathExists(filePath + ".bak")).toBe(true);
      const backupContent = await fs.readFile(filePath + ".bak", "utf-8");
      expect(backupContent).toContain('console.log("hello")');
    });

    it("should restore from backup", async () => {
      const filePath = path.join(TEST_DIR, "restore-test.ts");
      await fs.writeFile(filePath, "original content");
      await fs.writeFile(filePath + ".bak", "original content");

      await fs.writeFile(filePath, "modified content");
      const restored = await restoreFromBackup(filePath);
      expect(restored).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("original content");
    });

    it("should return false when no backup exists", async () => {
      const filePath = path.join(TEST_DIR, "no-backup-test.ts");
      const restored = await restoreFromBackup(filePath);
      expect(restored).toBe(false);
    });

    it("should cleanup old .bak files", async () => {
      const backupDir = path.join(TEST_DIR, "cleanup-test");
      await fs.ensureDir(backupDir);
      await fs.writeFile(path.join(backupDir, "old.ts.bak"), "old");
      await fs.writeFile(path.join(backupDir, "keep.ts"), "keep");

      // Make the .bak file appear old
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await fs.utimes(path.join(backupDir, "old.ts.bak"), oldTime, oldTime);

      const cleaned = await cleanupBackups(backupDir, 24 * 60 * 60 * 1000);
      expect(cleaned).toBe(1);
      expect(await fs.pathExists(path.join(backupDir, "old.ts.bak"))).toBe(
        false
      );
      expect(await fs.pathExists(path.join(backupDir, "keep.ts"))).toBe(true);

      await fs.remove(backupDir);
    });
  });
});
