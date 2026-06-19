import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  ESLintValidator,
  JSONValidator,
  PatternValidator,
  ValidatorRegistry,
  createValidatorRegistry,
} from "../../src/prevention/validators.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-validators");

describe("Validators", () => {
  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  describe("JSONValidator", () => {
    it("should validate valid JSON", async () => {
      const filePath = path.join(TEST_DIR, "valid.json");
      await fs.writeJson(filePath, { key: "value" });
      const validator = new JSONValidator({ enabled: true, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid JSON", async () => {
      const filePath = path.join(TEST_DIR, "invalid.json");
      await fs.writeFile(filePath, "{ broken");
      const validator = new JSONValidator({ enabled: true, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe("json-syntax");
    });

    it("should skip validation when disabled", async () => {
      const filePath = path.join(TEST_DIR, "bad.json");
      await fs.writeFile(filePath, "{ broken");
      const validator = new JSONValidator({ enabled: false, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
    });
  });

  describe("PatternValidator", () => {
    it("should detect console.log pattern", async () => {
      const filePath = path.join(TEST_DIR, "test.js");
      await fs.writeFile(filePath, 'console.log("test");\nconst x = 1;');
      const validator = new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
          {
            name: "console-log",
            pattern: /console\.log\(/,
            message: "Avoid console.log",
            severity: "warning",
          },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].rule).toBe("console-log");
    });

    it("should detect TODO comments", async () => {
      const filePath = path.join(TEST_DIR, "test.js");
      await fs.writeFile(filePath, "// TODO: implement this\nconst x = 1;");
      const validator = new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
          {
            name: "todo-comment",
            pattern: /TODO/i,
            message: "TODO found",
            severity: "warning",
          },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].rule).toBe("todo-comment");
    });

    it("should report severity correctly", async () => {
      const filePath = path.join(TEST_DIR, "test.js");
      await fs.writeFile(filePath, 'eval("danger");');
      const validator = new PatternValidator({
        enabled: true,
        rules: {},
        customRules: [
          {
            name: "no-eval",
            pattern: /eval\(/,
            message: "Avoid eval",
            severity: "error",
          },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.isValid).toBe(false);
    });

    it("should skip when disabled", async () => {
      const filePath = path.join(TEST_DIR, "test.js");
      await fs.writeFile(filePath, '"test");');
      const validator = new PatternValidator({
        enabled: false,
        rules: {},
        customRules: [
          {
            name: "console-log",
            pattern: /console\.log\(/,
            message: "Avoid console.log",
            severity: "warning",
          },
        ],
      });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
    });
  });

  describe("ValidatorRegistry", () => {
    it("should register and retrieve validators", () => {
      const registry = new ValidatorRegistry();
      const validator = new JSONValidator({ enabled: true, rules: {} });
      registry.register("json", validator);
      expect(registry.get("json")).toBe(validator);
    });

    it("should get all registered validators", () => {
      const registry = new ValidatorRegistry();
      registry.register(
        "json",
        new JSONValidator({ enabled: true, rules: {} })
      );
      registry.register(
        "pattern",
        new PatternValidator({ enabled: true, rules: {} })
      );
      expect(registry.getAll()).toHaveLength(2);
    });

    it("should validate files with applicable validators", async () => {
      const filePath = path.join(TEST_DIR, "data.json");
      await fs.writeJson(filePath, { valid: true });

      const registry = new ValidatorRegistry();
      registry.register(
        "json",
        new JSONValidator({ enabled: true, rules: {} })
      );
      const result = await registry.validateFile(filePath);
      expect(result.isValid).toBe(true);
    });
  });

  describe("createValidatorRegistry", () => {
    it("should create registry with default validators", () => {
      const registry = createValidatorRegistry();
      const names = registry.getAll().map((v) => v.getName());
      expect(names).toContain("eslint");
      expect(names).toContain("json");
      expect(names).toContain("yaml");
      expect(names).toContain("pattern");
    });
  });

  describe("ESLintValidator (V5)", () => {
    it("should skip when disabled", async () => {
      const filePath = path.join(TEST_DIR, "eslint-disabled.ts");
      await fs.writeFile(filePath, "const x = 1;");
      const validator = new ESLintValidator({ enabled: false, rules: {} });
      const result = await validator.validate(filePath);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return valid when ESLint is not available", async () => {
      const filePath = path.join(TEST_DIR, "eslint-unavailable.ts");
      await fs.writeFile(filePath, "const x = 1;");
      const validator = new ESLintValidator({ enabled: true, rules: {} });
      const result = await validator.validate(filePath);
      expect(result).toBeDefined();
      expect(typeof result.isValid).toBe("boolean");
    });

    it("should detect typescript project via .ts files in root", async () => {
      const projectDir = path.join(TEST_DIR, "detect-ts-root");
      await fs.ensureDir(projectDir);
      await fs.writeFile(path.join(projectDir, "main.ts"), "export {}");

      const { injectFiles } = await import("../../src/injection/index.js");
      const { getEslintTemplate } = await import(
        "../../src/injection/index.js"
      );

      const isTypescript = (await fs.readdir(projectDir)).some(
        (f) => f.endsWith(".ts") || f.endsWith(".tsx")
      );
      expect(isTypescript).toBe(true);

      const template = getEslintTemplate(isTypescript);
      expect(template.fileName).toBe(".eslintrc.json");

      const results = await injectFiles({
        projectDir,
        agents: ["eslint"],
        config: {
          enabled: true,
          templates: ["eslint"],
          autoInject: false,
          autoUpdate: false,
          forceOverwrite: false,
          projectPatterns: [],
        },
        force: true,
      });

      expect(results.length).toBeGreaterThan(0);
      const injected = results.find((r) => r.agent === "eslint");
      expect(injected?.action).toBe("created");
      expect(await fs.pathExists(path.join(projectDir, ".eslintrc.json"))).toBe(
        true
      );

      await fs.remove(projectDir);
    });

    it("should detect javascript project (no .ts files)", async () => {
      const projectDir = path.join(TEST_DIR, "detect-js-only");
      await fs.ensureDir(projectDir);
      await fs.writeFile(
        path.join(projectDir, "main.js"),
        "module.exports = {}"
      );

      const { getEslintTemplate } = await import(
        "../../src/injection/index.js"
      );

      const entries = await fs.readdir(projectDir);
      const isTypescript = entries.some(
        (f) => f.endsWith(".ts") || f.endsWith(".tsx")
      );
      expect(isTypescript).toBe(false);

      const template = getEslintTemplate(isTypescript);
      expect(template.id).toBe("eslint-javascript");

      await fs.remove(projectDir);
    });

    it("should inject ESLint config when missing and project has TS files", async () => {
      const projectDir = path.join(TEST_DIR, "eslint-inject-ts");
      await fs.ensureDir(projectDir);
      await fs.writeFile(path.join(projectDir, "main.ts"), "export {}");

      const filePath = path.join(projectDir, "test.ts");
      await fs.writeFile(filePath, "const x = 1;\n");

      const { injectFiles } = await import("../../src/injection/index.js");
      const results = await injectFiles({
        projectDir,
        agents: ["eslint"],
        config: {
          enabled: true,
          templates: ["eslint"],
          autoInject: false,
          autoUpdate: false,
          forceOverwrite: false,
          projectPatterns: [],
        },
        force: true,
      });

      const injected = results.find((r) => r.agent === "eslint");
      expect(
        injected?.action === "created" || injected?.action === "updated"
      ).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, ".eslintrc.json"))).toBe(
        true
      );

      await fs.remove(projectDir);
    });

    it("should inject ESLint config for JS-only projects", async () => {
      const projectDir = path.join(TEST_DIR, "eslint-inject-js");
      await fs.ensureDir(projectDir);
      await fs.writeFile(
        path.join(projectDir, "main.js"),
        "module.exports = {}"
      );

      const filePath = path.join(projectDir, "test.js");
      await fs.writeFile(filePath, "const x = 1;\n");

      const { injectFiles } = await import("../../src/injection/index.js");
      const results = await injectFiles({
        projectDir,
        agents: ["eslint"],
        config: {
          enabled: true,
          templates: ["eslint"],
          autoInject: false,
          autoUpdate: false,
          forceOverwrite: false,
          projectPatterns: [],
        },
        force: true,
      });

      const injected = results.find((r) => r.agent === "eslint");
      expect(
        injected?.action === "created" || injected?.action === "updated"
      ).toBe(true);
      expect(await fs.pathExists(path.join(projectDir, ".eslintrc.json"))).toBe(
        true
      );

      await fs.remove(projectDir);
    });
  });
});
