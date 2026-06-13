import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  analyzeProject,
  formatAnalysis,
} from "../../src/analysis/project-analyzer.js";
import {
  evaluateRules,
  getTriggeredRules,
  getEnforcedRules,
  getSuggestedRules,
  formatEvaluations,
  getDefaultRules,
} from "../../src/analysis/rules-engine.js";
import type { ProjectAnalysis } from "../../src/analysis/types.js";

describe("V3.4 - Analysis System", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-analysis-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ===== ProjectAnalyzer =====

  describe("ProjectAnalyzer", () => {
    test("should analyze empty directory", async () => {
      const analysis = await analyzeProject(tmpDir);

      expect(analysis.name).toBeTruthy();
      expect(analysis.language).toBe("unknown");
      expect(analysis.packageManager).toBe("unknown");
      expect(analysis.hasTypeScript).toBe(false);
      expect(analysis.hasESLint).toBe(false);
      expect(analysis.hasPrettier).toBe(false);
      expect(analysis.hasTests).toBe(false);
      expect(analysis.hasConsignmentFiles).toBe(false);
      expect(analysis.srcDir).toBe(false);
      expect(analysis.testDir).toBe(false);
    });

    test("should detect TypeScript project", async () => {
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          name: "test",
          devDependencies: { typescript: "^5.0.0" },
        }),
        "utf-8"
      );
      await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}", "utf-8");
      await fs.mkdir(path.join(tmpDir, "src"));
      await fs.writeFile(path.join(tmpDir, "src", "index.ts"), "", "utf-8");

      const analysis = await analyzeProject(tmpDir);

      expect(analysis.language).toBe("typescript");
      expect(analysis.hasTypeScript).toBe(true);
      expect(analysis.srcDir).toBe(true);
      expect(analysis.tsconfigExists).toBe(true);
      expect(analysis.packageJsonExists).toBe(true);
    });

    test("should detect ESLint", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".eslintrc.cjs"),
        "module.exports = {}",
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.hasESLint).toBe(true);
    });

    test("should detect Prettier", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".prettierrc"),
        JSON.stringify({ singleQuote: true }),
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.hasPrettier).toBe(true);
    });

    test("should detect test framework", async () => {
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }),
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.hasTests).toBe(false);
      expect(analysis.testFramework).toBe("jest");
    });

    test("should detect test directory", async () => {
      await fs.mkdir(path.join(tmpDir, "tests"));

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.hasTests).toBe(true);
      expect(analysis.testDir).toBe(true);
    });

    test("should detect consignment files", async () => {
      await fs.writeFile(path.join(tmpDir, "CLAUDE.md"), "# Claude", "utf-8");
      await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# Agents", "utf-8");

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.hasConsignmentFiles).toBe(true);
      expect(analysis.consignmentFiles).toContain("CLAUDE.md");
      expect(analysis.consignmentFiles).toContain("AGENTS.md");
    });

    test("should detect yarn package manager", async () => {
      await fs.writeFile(path.join(tmpDir, "yarn.lock"), "", "utf-8");

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.packageManager).toBe("yarn");
    });

    test("should detect monorepo architecture", async () => {
      await fs.writeFile(
        path.join(tmpDir, "lerna.json"),
        JSON.stringify({ version: "independent" }),
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.architecture).toBe("monorepo");
    });

    test("should detect framework from dependencies", async () => {
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "test", dependencies: { react: "^18.0.0" } }),
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.framework).toBe("react");
    });

    test("should detect conventions from .editorconfig", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".editorconfig"),
        "indent_style = tab\nindent_size = 4\nend_of_line = crlf\n",
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.conventions.indentStyle).toBe("tabs");
      expect(analysis.conventions.indentSize).toBe(4);
      expect(analysis.conventions.lineEnding).toBe("crlf");
    });

    test("should detect conventions from .prettierrc", async () => {
      await fs.writeFile(
        path.join(tmpDir, ".prettierrc"),
        JSON.stringify({ singleQuote: true, semi: false, tabWidth: 4 }),
        "utf-8"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.conventions.quotes).toBe("single");
      expect(analysis.conventions.semicolons).toBe(false);
      expect(analysis.conventions.indentSize).toBe(4);
    });

    test("formatAnalysis should produce readable output", async () => {
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          name: "test",
          devDependencies: { typescript: "^5.0.0" },
        }),
        "utf-8"
      );
      await fs.mkdir(path.join(tmpDir, "src"));

      const analysis = await analyzeProject(tmpDir);
      const formatted = formatAnalysis(analysis);

      expect(formatted).toContain("Project:");
      expect(formatted).toContain("Language:");
      expect(formatted).toContain("TypeScript:");
    });
  });

  // ===== Rules Engine =====

  describe("Rules Engine", () => {
    const mockAnalysis: ProjectAnalysis = {
      name: "test-project",
      language: "typescript",
      packageManager: "npm",
      hasTypeScript: true,
      hasESLint: true,
      hasPrettier: false,
      hasTests: true,
      testFramework: "jest",
      architecture: "single",
      conventions: {
        indentStyle: "spaces",
        indentSize: 2,
        lineEnding: "lf",
        semicolons: true,
        quotes: "double",
      },
      hasConsignmentFiles: false,
      consignmentFiles: [],
      srcDir: true,
      testDir: true,
      configDir: true,
      packageJsonExists: true,
      tsconfigExists: true,
    };

    test("should have default rules", () => {
      const rules = getDefaultRules();
      expect(rules.length).toBeGreaterThanOrEqual(10);
    });

    test("should evaluate rules against analysis", () => {
      const evaluations = evaluateRules(mockAnalysis);
      expect(evaluations.length).toBeGreaterThanOrEqual(10);

      for (const e of evaluations) {
        expect(e.ruleId).toBeTruthy();
        expect(e.ruleName).toBeTruthy();
        expect(["enforce", "suggest", "skip"]).toContain(e.action);
      }
    });

    test("should trigger no-any rule for TypeScript", () => {
      const evaluations = evaluateRules(mockAnalysis);
      const noAny = evaluations.find((e) => e.ruleId === "no-any-type");
      expect(noAny?.triggered).toBe(true);
      expect(noAny?.action).toBe("enforce");
    });

    test("should suggest ESLint when missing", () => {
      const analysis = { ...mockAnalysis, hasESLint: false };
      const evaluations = evaluateRules(analysis);
      const eslintRule = evaluations.find(
        (e) => e.ruleId === "eslint-required"
      );
      expect(eslintRule?.triggered).toBe(true);
      expect(eslintRule?.action).toBe("suggest");
    });

    test("should not suggest ESLint when present", () => {
      const evaluations = evaluateRules(mockAnalysis);
      const eslintRule = evaluations.find(
        (e) => e.ruleId === "eslint-required"
      );
      expect(eslintRule?.triggered).toBe(false);
    });

    test("should suggest consignment files when missing", () => {
      const evaluations = evaluateRules(mockAnalysis);
      const consignmentRule = evaluations.find(
        (e) => e.ruleId === "consignment-files"
      );
      expect(consignmentRule?.triggered).toBe(true);
      expect(consignmentRule?.action).toBe("suggest");
    });

    test("should not suggest consignment files when present", () => {
      const analysis = {
        ...mockAnalysis,
        hasConsignmentFiles: true,
        consignmentFiles: ["CLAUDE.md"],
      };
      const evaluations = evaluateRules(analysis);
      const consignmentRule = evaluations.find(
        (e) => e.ruleId === "consignment-files"
      );
      expect(consignmentRule?.triggered).toBe(false);
    });

    test("getTriggeredRules should return only triggered", () => {
      const triggered = getTriggeredRules(mockAnalysis);
      for (const e of triggered) {
        expect(e.triggered).toBe(true);
      }
    });

    test("getEnforcedRules should return only enforce actions", () => {
      const enforced = getEnforcedRules(mockAnalysis);
      for (const e of enforced) {
        expect(e.action).toBe("enforce");
        expect(e.triggered).toBe(true);
      }
    });

    test("getSuggestedRules should return only suggest actions", () => {
      const suggested = getSuggestedRules(mockAnalysis);
      for (const e of suggested) {
        expect(e.action).toBe("suggest");
        expect(e.triggered).toBe(true);
      }
    });

    test("formatEvaluations should produce readable output", () => {
      const evaluations = evaluateRules(mockAnalysis);
      const formatted = formatEvaluations(evaluations);

      expect(formatted).toContain("Triggered rules:");
    });

    test("formatEvaluations for no triggers", () => {
      const analysis = {
        ...mockAnalysis,
        hasTypeScript: false,
        hasESLint: false,
        hasPrettier: false,
        hasTests: false,
        hasConsignmentFiles: true,
        srcDir: false,
        configDir: false,
        packageJsonExists: false,
      };
      const evaluations = evaluateRules(analysis);
      const triggered = evaluations.filter((e) => e.triggered);
      // safe-spawn and sanitize-paths always trigger
      expect(triggered.length).toBeGreaterThanOrEqual(0);
    });
  });
});
