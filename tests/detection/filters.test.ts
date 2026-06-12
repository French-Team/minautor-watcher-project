import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  FileFilter,
  FilterPresets,
  createFileFilter,
  FileEvent,
} from "../../src/detection/filters.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-filters");
const createEvent = (filePath: string, relativePath?: string): FileEvent => ({
  filePath,
  relativePath: relativePath || filePath,
  extension: path.extname(filePath).toLowerCase().slice(1),
  timestamp: new Date(),
});

describe("FileFilter", () => {
  let testFile: string;

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
    testFile = path.join(TEST_DIR, "test.ts");
    await fs.writeFile(testFile, "const x = 1;");
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe("filter by extension", () => {
    it("should pass files with allowed extensions", async () => {
      const filter = createFileFilter({ extensions: ["ts", "js"] });
      const result = await filter.apply(createEvent(testFile, "test.ts"));
      expect(result.passed).toBe(true);
    });

    it("should block files with disallowed extensions", async () => {
      const filter = createFileFilter({ extensions: ["js"] });
      const result = await filter.apply(createEvent(testFile, "test.ts"));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("not in allowed list");
    });
  });

  describe("filter by exclude patterns", () => {
    it("should block paths matching exclude patterns", async () => {
      const filter = createFileFilter({ excludePatterns: ["node_modules"] });
      const result = await filter.apply(
        createEvent(
          "/project/node_modules/pkg/index.js",
          "node_modules/pkg/index.js"
        )
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("exclude pattern");
    });

    it("should pass paths not matching exclude patterns", async () => {
      const filter = createFileFilter({ excludePatterns: ["node_modules"] });
      const result = await filter.apply(createEvent(testFile, "src/test.ts"));
      expect(result.passed).toBe(true);
    });
  });

  describe("filter by include patterns", () => {
    it("should pass paths matching include patterns", async () => {
      const filter = createFileFilter({ includePatterns: ["src"] });
      const result = await filter.apply(createEvent(testFile, "src/test.ts"));
      expect(result.passed).toBe(true);
    });

    it("should block paths not matching include patterns", async () => {
      const filter = createFileFilter({ includePatterns: ["src"] });
      const result = await filter.apply(
        createEvent("/dist/bundle.js", "dist/bundle.js")
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("include pattern");
    });
  });

  describe("filter by file size", () => {
    it("should pass files within size limits", async () => {
      const filter = createFileFilter({ maxFileSize: 1024 * 1024 });
      const result = await filter.apply(createEvent(testFile, "test.ts"));
      expect(result.passed).toBe(true);
    });

    it("should block oversized files", async () => {
      const largeFile = path.join(TEST_DIR, "large.ts");
      await fs.writeFile(largeFile, Buffer.alloc(1024 * 10));
      const filter = createFileFilter({ maxFileSize: 100 });
      const result = await filter.apply(createEvent(largeFile, "large.ts"));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("exceeds maximum");
    });
  });

  describe("FilterPresets", () => {
    it("jsTsProject preset should filter for JS/TS projects", () => {
      const criteria = FilterPresets.jsTsProject();
      expect(criteria.extensions).toContain("ts");
      expect(criteria.extensions).toContain("js");
      expect(criteria.excludePatterns).toContain("node_modules/**");
      expect(criteria.maxFileSize).toBe(1024 * 1024);
    });

    it("minimal preset should have basic extensions", () => {
      const criteria = FilterPresets.minimal();
      expect(criteria.extensions).toEqual(["js", "ts"]);
      expect(criteria.excludePatterns).toContain("node_modules/**");
    });

    it("comprehensive preset should have wide coverage", () => {
      const criteria = FilterPresets.comprehensive();
      expect(criteria.extensions).toContain("html");
      expect(criteria.extensions).toContain("css");
      expect(criteria.extensions).toContain("yaml");
      expect(criteria.maxFileSize).toBe(5 * 1024 * 1024);
      expect(criteria.modifiedWithin).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe("updateCriteria", () => {
    it("should merge new criteria with existing", () => {
      const filter = createFileFilter({ extensions: ["ts"] });
      filter.updateCriteria({ extensions: ["js"] });
      expect(filter.getCriteria().extensions).toEqual(["js"]);
    });
  });
});
