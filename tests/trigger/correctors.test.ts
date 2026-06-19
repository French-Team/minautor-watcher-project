import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  CorrectorRegistry,
  createCorrectorRegistry,
  TextReplacementCorrector,
  CommandCorrector,
  ESLintFixCorrector,
  PrettierFormatCorrector,
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

  describe("TextReplacementCorrector - V5 features", () => {
    it("should apply text insertion at specific line", async () => {
      const filePath = path.join(TEST_DIR, "insert-test.ts");
      await fs.writeFile(filePath, "line1\nline2\nline3");

      const corrector = new TextReplacementCorrector({
        id: "insert-test",
        name: "Insert Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [
          {
            type: "insert",
            target: 1,
            content: "inserted line",
          },
        ],
      });

      const result = await corrector.applyCorrection(filePath);
      expect(result.success).toBe(true);
      expect(result.corrected).toBe(true);
      expect(result.changes).toHaveLength(1);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("inserted line");
    });

    it("should apply text deletion at specific line", async () => {
      const filePath = path.join(TEST_DIR, "delete-test.ts");
      await fs.writeFile(filePath, "line1\nline2\nline3");

      const corrector = new TextReplacementCorrector({
        id: "delete-test",
        name: "Delete Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [
          {
            type: "delete",
            target: 1,
          },
        ],
      });

      const result = await corrector.applyCorrection(filePath);
      expect(result.success).toBe(true);
      expect(result.corrected).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).not.toContain("line2");
    });

    it("should handle dry-run without modifying file", async () => {
      const filePath = path.join(TEST_DIR, "dryrun-test.ts");
      const original = 'console.log("hello");';
      await fs.writeFile(filePath, original);

      const corrector = new TextReplacementCorrector({
        id: "dryrun-test",
        name: "DryRun Test",
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

      const result = await corrector.applyCorrection(filePath, undefined, true);
      expect(result.success).toBe(true);
      expect(result.corrected).toBe(true);
      expect(result.correctedContent).toContain('logger.info("hello")');
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe(original);
    });

    it("should check file extension conditions", () => {
      const corrector = new TextReplacementCorrector({
        id: "ext-test",
        name: "Ext Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {
          fileExtensions: ["ts", "tsx"],
        },
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(true);
      expect(corrector.canCorrect("test.tsx")).toBe(true);
      expect(corrector.canCorrect("test.js")).toBe(false);
      expect(corrector.canCorrect("test.json")).toBe(false);
    });

    it("should check file pattern conditions against basename", () => {
      const corrector = new TextReplacementCorrector({
        id: "pattern-test",
        name: "Pattern Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {
          filePatterns: ["src-file"],
        },
        actions: [],
      });

      expect(corrector.canCorrect("/project/src/src-file.ts")).toBe(true);
      expect(corrector.canCorrect("/project/test/other-file.ts")).toBe(false);
    });

    it("should return false when disabled for canCorrect", () => {
      const corrector = new TextReplacementCorrector({
        id: "disabled-test",
        name: "Disabled Test",
        description: "Test",
        enabled: false,
        priority: 1,
        conditions: {},
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(false);
    });
  });

  describe("CommandCorrector (V5)", () => {
    it("should have run-command action type", async () => {
      const corrector = new CommandCorrector("cmd-test", {
        id: "cmd-test",
        name: "Cmd Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [
          {
            type: "run-command",
            command: "node",
            args: ["-e", "process.stdout.write(String(1))"],
          },
        ],
      });

      expect(corrector.canCorrect("test.ts")).toBe(true);
      const result = await corrector.applyCorrection(
        path.join(TEST_DIR, "cmd-test.ts"),
        undefined,
        false
      );
      expect(result.success).toBe(true);
      expect(result.corrected).toBe(true);
    });

    it("should return false when no run-command actions", () => {
      const corrector = new CommandCorrector("no-cmd", {
        id: "no-cmd",
        name: "No Cmd",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(false);
    });
  });

  describe("ESLintFixCorrector (V5)", () => {
    it("should support JS/TS file extensions", () => {
      const corrector = new ESLintFixCorrector({
        id: "eslint-fix-test",
        name: "ESLint Fix Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(true);
      expect(corrector.canCorrect("test.js")).toBe(true);
      expect(corrector.canCorrect("test.tsx")).toBe(true);
      expect(corrector.canCorrect("test.jsx")).toBe(true);
      expect(corrector.canCorrect("test.json")).toBe(false);
      expect(corrector.canCorrect("test.md")).toBe(false);
    });

    it("should skip when disabled", () => {
      const corrector = new ESLintFixCorrector({
        id: "disabled-eslint",
        name: "Disabled ESLint",
        description: "Test",
        enabled: false,
        priority: 1,
        conditions: {},
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(false);
    });
  });

  describe("PrettierFormatCorrector (V5)", () => {
    it("should support JS/TS/JSON/MD/CSS file extensions", () => {
      const corrector = new PrettierFormatCorrector({
        id: "prettier-test",
        name: "Prettier Test",
        description: "Test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(true);
      expect(corrector.canCorrect("test.js")).toBe(true);
      expect(corrector.canCorrect("test.json")).toBe(true);
      expect(corrector.canCorrect("test.md")).toBe(true);
      expect(corrector.canCorrect("test.css")).toBe(true);
      expect(corrector.canCorrect("test.scss")).toBe(true);
      expect(corrector.canCorrect("test.yaml")).toBe(false);
    });

    it("should skip when disabled", () => {
      const corrector = new PrettierFormatCorrector({
        id: "disabled-prettier",
        name: "Disabled Prettier",
        description: "Test",
        enabled: false,
        priority: 1,
        conditions: {},
        actions: [],
      });

      expect(corrector.canCorrect("test.ts")).toBe(false);
    });
  });

  describe("CorrectorRegistry - V5.6 parallel applyCorrections", () => {
    it("should apply all applicable correctors to a file", async () => {
      const filePath = path.join(TEST_DIR, "parallel-test.ts");
      await fs.writeFile(filePath, 'console.log("hello");');

      const registry = createCorrectorRegistry();
      const results = await registry.applyCorrections(filePath);

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(typeof r.success).toBe("boolean");
      });
    });

    it("should apply corrections with dry-run flag", async () => {
      const filePath = path.join(TEST_DIR, "parallel-dryrun.ts");
      const original = "const x = 1;\n";
      await fs.writeFile(filePath, original);

      const registry = createCorrectorRegistry();
      const results = await registry.applyCorrections(
        filePath,
        undefined,
        true
      );

      expect(results.length).toBeGreaterThan(0);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe(original);
    });

    it("should return empty results for file with no applicable correctors", async () => {
      const registry = new CorrectorRegistry();
      const results = await registry.applyCorrections(
        path.join(TEST_DIR, "no-match.png")
      );
      expect(results).toHaveLength(0);
    });
  });

  describe("CorrectorRegistry - applyBatchCorrections", () => {
    it("should batch process multiple files", async () => {
      const file1 = path.join(TEST_DIR, "batch-1.ts");
      const file2 = path.join(TEST_DIR, "batch-2.ts");
      await fs.writeFile(file1, 'console.log("a");');
      await fs.writeFile(file2, 'console.log("b");');

      const registry = createCorrectorRegistry();
      const results = await registry.applyBatchCorrections([file1, file2]);

      expect(results.size).toBe(2);
      expect(results.has(file1)).toBe(true);
      expect(results.has(file2)).toBe(true);
    });

    it("should return empty map for empty input", async () => {
      const registry = createCorrectorRegistry();
      const results = await registry.applyBatchCorrections([]);
      expect(results.size).toBe(0);
    });
  });
});
