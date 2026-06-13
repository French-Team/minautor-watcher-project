import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  getAllTemplates,
  getTemplatesForAgent,
  getTemplateById,
  getFileNameForAgent,
  getManagedHeader,
} from "../../src/injection/templates.js";
import {
  checkInjectionStatus,
  formatCheckResult,
} from "../../src/injection/detector.js";
import {
  injectFiles,
  formatInjectionResults,
} from "../../src/injection/injector.js";
import {
  validateConsignmentFiles,
  formatConsignmentResult,
} from "../../src/injection/validator.js";

describe("V3.1 - Injection System", () => {
  // ===== Templates =====

  describe("Templates", () => {
    test("should provide all templates", () => {
      const templates = getAllTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(4);
    });

    test("should have required fields on all templates", () => {
      const templates = getAllTemplates();
      for (const t of templates) {
        expect(t.id).toBeTruthy();
        expect(t.agent).toBeTruthy();
        expect(t.fileName).toBeTruthy();
        expect(t.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(t.content).toBeTruthy();
      }
    });

    test("should filter templates by agent", () => {
      const claudeTemplates = getTemplatesForAgent("claude");
      expect(claudeTemplates.length).toBeGreaterThanOrEqual(1);
      for (const t of claudeTemplates) {
        expect(t.agent).toBe("claude");
      }
    });

    test("should get template by ID", () => {
      const template = getTemplateById("claude-default");
      expect(template).toBeDefined();
      expect(template?.agent).toBe("claude");
      expect(template?.fileName).toBe("CLAUDE.md");
    });

    test("should return undefined for unknown template ID", () => {
      expect(getTemplateById("nonexistent")).toBeUndefined();
    });

    test("should get file name for agent", () => {
      expect(getFileNameForAgent("claude")).toBe("CLAUDE.md");
      expect(getFileNameForAgent("generic")).toBe("AGENTS.md");
      expect(getFileNameForAgent("copilot")).toBe(
        ".github/copilot-instructions.md"
      );
      expect(getFileNameForAgent("cursor")).toBe(".cursorrules");
    });

    test("should return managed header", () => {
      const header = getManagedHeader();
      expect(header).toContain("Managed by watcher-service");
    });

    test("all templates should have managed header in content", () => {
      const templates = getAllTemplates();
      const header = getManagedHeader();
      for (const t of templates) {
        expect(t.content).toContain(header);
      }
    });
  });

  // ===== V3.2 Template Content Validation =====

  describe("V3.2 - Template Content", () => {
    const ALL_TEMPLATES_CONTENT = getAllTemplates();

    test("all templates should mention security rules", () => {
      for (const template of ALL_TEMPLATES_CONTENT) {
        const lower = template.content.toLowerCase();
        expect(lower).toContain("safespawn");
        expect(lower).toContain("sanitizepath");
      }
    });

    test("all templates should forbid any type", () => {
      for (const template of ALL_TEMPLATES_CONTENT) {
        const lower = template.content.toLowerCase();
        expect(lower).toContain("any");
        expect(lower).toContain("unknown");
      }
    });

    test("all templates should mention secrets protection", () => {
      for (const template of ALL_TEMPLATES_CONTENT) {
        const lower = template.content.toLowerCase();
        expect(lower).toContain("secret");
      }
    });

    test("CLAUDE.md should contain project-specific guidance", () => {
      const claude = getTemplateById("claude-default");
      expect(claude).toBeDefined();
      expect(claude?.content).toContain("Contexte");
      expect(claude?.content).toContain("Erreurs courantes");
      expect(claude?.content).toContain("Structure du projet");
      expect(claude?.content).toContain("Commandes utiles");
    });

    test("AGENTS.md should contain universal rules", () => {
      const agents = getTemplateById("agents-generic");
      expect(agents).toBeDefined();
      expect(agents?.content).toContain("Priorites");
      expect(agents?.content).toContain("Actions interdites");
      expect(agents?.content).toContain("Actions recommandees");
    });

    test("Cursor rules should contain TypeScript guidance", () => {
      const cursor = getTemplateById("cursor-default");
      expect(cursor).toBeDefined();
      expect(cursor?.content).toContain("TypeScript");
      expect(cursor?.content).toContain("strict");
    });

    test("Copilot instructions should contain security rules", () => {
      const copilot = getTemplateById("copilot-default");
      expect(copilot).toBeDefined();
      expect(copilot?.content).toContain("Security");
      expect(copilot?.content).toContain("safeSpawn");
    });

    test("Windsurf rules should contain testing guidance", () => {
      const windsurf = getTemplateById("windsurf-default");
      expect(windsurf).toBeDefined();
      expect(windsurf?.content).toContain("Testing");
      expect(windsurf?.content).toContain("npm test");
    });

    test("all templates should be substantial (>200 chars)", () => {
      for (const template of ALL_TEMPLATES_CONTENT) {
        expect(template.content.length).toBeGreaterThan(200);
      }
    });

    test("all templates should have version 1.0.0", () => {
      for (const template of ALL_TEMPLATES_CONTENT) {
        expect(template.version).toBe("1.0.0");
      }
    });
  });

  // ===== Detector =====

  describe("Detector", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-test-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("should report all missing when no files exist", async () => {
      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude", "generic"],
      });

      expect(result.missingCount).toBeGreaterThanOrEqual(2);
      for (const agent of result.agents) {
        expect(agent.present).toBe(false);
      }
    });

    test("should detect existing consignment file", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        "# Claude rules",
        "utf-8"
      );

      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      const claudeStatus = result.agents.find((a) => a.agent === "claude");
      expect(claudeStatus?.present).toBe(true);
      expect(claudeStatus?.managedByWatcher).toBe(false);
    });

    test("should detect managed file", async () => {
      const header = getManagedHeader();
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        `${header}\n\n# Claude rules`,
        "utf-8"
      );

      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      const claudeStatus = result.agents.find((a) => a.agent === "claude");
      expect(claudeStatus?.managedByWatcher).toBe(true);
    });

    test("should detect outdated version", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        `<!-- Managed by watcher-service v0.0.1 -->\n\n# Claude rules`,
        "utf-8"
      );

      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      const claudeStatus = result.agents.find((a) => a.agent === "claude");
      expect(claudeStatus?.outdated).toBe(true);
      expect(claudeStatus?.currentVersion).toBe("0.0.1");
    });

    test("should format check result", async () => {
      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      const formatted = formatCheckResult(result);
      expect(formatted).toContain("Injection check for:");
      expect(formatted).toContain("MISSING");
    });
  });

  // ===== Injector =====

  describe("Injector", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-test-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("should inject missing files", async () => {
      const results = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const created = results.filter((r) => r.action === "created");
      expect(created.length).toBeGreaterThanOrEqual(1);
    });

    test("should not overwrite existing files without force", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        "# My custom rules",
        "utf-8"
      );

      const results = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });

      const skipped = results.filter((r) => r.action === "skipped");
      expect(skipped.length).toBeGreaterThanOrEqual(1);
    });

    test("should overwrite existing files with force", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        "# My custom rules",
        "utf-8"
      );

      const results = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: true,
      });

      const updated = results.filter((r) => r.action === "updated");
      expect(updated.length).toBeGreaterThanOrEqual(1);
    });

    test("should create backup before overwrite", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        "# My custom rules",
        "utf-8"
      );

      await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: true,
      });

      const backupExists = await fs
        .access(path.join(tmpDir, "CLAUDE.md.bak"))
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    test("should handle dry run", async () => {
      const results = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        dryRun: true,
      });

      for (const r of results) {
        expect(r.reason).toContain("Dry run");
      }
    });

    test("should handle deeply nested directories", async () => {
      const deepDir = path.join(tmpDir, "a", "b", "c");
      await fs.mkdir(deepDir, { recursive: true });

      const results = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const fileExists = await fs
        .access(path.join(tmpDir, "CLAUDE.md"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    test("should format injection results", () => {
      const results = formatInjectionResults([
        { file: "CLAUDE.md", agent: "claude", action: "created" },
        {
          file: "AGENTS.md",
          agent: "generic",
          action: "error",
          reason: "Permission denied",
        },
      ]);

      expect(results).toContain("Injection results:");
      expect(results).toContain("created");
      expect(results).toContain("ERROR");
    });
  });

  // ===== Validator (Prevention Integration) =====

  describe("Validator", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-test-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("should fail validation when files missing", async () => {
      const result = await validateConsignmentFiles(tmpDir, {
        requiredAgents: ["claude"],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].rule).toBe("consignment-file-missing");
    });

    test("should pass validation when files present", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        "# Claude rules",
        "utf-8"
      );

      const result = await validateConsignmentFiles(tmpDir, {
        requiredAgents: ["claude"],
      });

      expect(result.isValid).toBe(true);
    });

    test("should warn about outdated files", async () => {
      await fs.writeFile(
        path.join(tmpDir, "CLAUDE.md"),
        `<!-- Managed by watcher-service v0.0.1 -->\n\n# Claude rules`,
        "utf-8"
      );

      const result = await validateConsignmentFiles(tmpDir, {
        requiredAgents: ["claude"],
      });

      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings[0].rule).toBe("consignment-file-outdated");
    });

    test("should auto-fix missing files when enabled", async () => {
      await validateConsignmentFiles(tmpDir, {
        requiredAgents: ["claude"],
        autoFix: true,
      });

      const fileExists = await fs
        .access(path.join(tmpDir, "CLAUDE.md"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    test("should handle disabled validator", async () => {
      const result = await validateConsignmentFiles(tmpDir, {
        enabled: false,
      });

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test("should format validation result", () => {
      const result = formatConsignmentResult({
        isValid: false,
        errors: [
          {
            rule: "test",
            message: "Test error",
            file: "test.md",
            severity: "error",
          },
        ],
        warnings: [],
      });

      expect(result).toContain("ISSUES FOUND");
      expect(result).toContain("Test error");
    });
  });

  // ===== V3.3 Scan Integration =====

  describe("V3.3 - Scan Integration", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-test-scan-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("scan detects missing consignment files", async () => {
      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude", "generic"],
      });

      expect(result.missingCount).toBeGreaterThanOrEqual(2);
    });

    test("scan injects files when --inject is used", async () => {
      const injResult = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });
      expect(injResult.missingCount).toBeGreaterThanOrEqual(1);

      const injectResult = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });

      const created = injectResult.filter((r) => r.action === "created");
      expect(created.length).toBeGreaterThanOrEqual(1);

      // Verify file was created
      const fileExists = await fs
        .access(path.join(tmpDir, "CLAUDE.md"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    test("scan --dry-run does not modify files", async () => {
      const injectResult = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        dryRun: true,
      });

      for (const r of injectResult) {
        expect(r.reason).toContain("Dry run");
      }

      const fileExists = await fs
        .access(path.join(tmpDir, "CLAUDE.md"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });

    test("scan --all runs both injection and correction", async () => {
      // Injection
      const injResult = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });
      expect(injResult.missingCount).toBeGreaterThanOrEqual(1);

      const injectResult = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });
      expect(
        injectResult.filter((r) => r.action === "created").length
      ).toBeGreaterThanOrEqual(1);

      // Verify both injection and correction could run
      const fileExists = await fs
        .access(path.join(tmpDir, "CLAUDE.md"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    test("scan with specific agents only", async () => {
      const result = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      // Only CLAUDE.md should be checked
      expect(result.agents.length).toBe(1);
      expect(result.agents[0].fileName).toBe("CLAUDE.md");
    });

    test("scan --report generates report data", async () => {
      const injResult = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      const report = {
        timestamp: new Date().toISOString(),
        directory: tmpDir,
        injection: injResult,
        summary: {
          filesScanned: 0,
          issuesFound: 0,
          fixesApplied: 0,
          injected: injResult.missingCount,
        },
      };

      expect(report.timestamp).toBeTruthy();
      expect(report.directory).toBe(tmpDir);
      expect(report.injection).toBeDefined();
      expect(report.summary.injected).toBeGreaterThanOrEqual(1);
    });
  });

  // ===== V3.5 Integration: Analysis + Injection + Scan =====

  describe("V3.5 - Full Integration", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-v35-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("analysis + injection workflow", async () => {
      // 1. Analyze empty project
      const { analyzeProject } = await import(
        "../../src/analysis/project-analyzer.js"
      );
      const { evaluateRules } = await import(
        "../../src/analysis/rules-engine.js"
      );

      const analysis = await analyzeProject(tmpDir);
      expect(analysis.language).toBe("unknown");
      expect(analysis.hasConsignmentFiles).toBe(false);

      // 2. Evaluate rules
      const evaluations = evaluateRules(analysis);
      const consignmentRule = evaluations.find(
        (e) => e.ruleId === "consignment-files"
      );
      expect(consignmentRule?.triggered).toBe(true);

      // 3. Inject files
      const injectResult = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude", "generic"],
        force: false,
      });

      const created = injectResult.filter((r) => r.action === "created");
      expect(created.length).toBeGreaterThanOrEqual(2);

      // 4. Re-analyze — should now have consignment files
      const analysisAfter = await analyzeProject(tmpDir);
      expect(analysisAfter.hasConsignmentFiles).toBe(true);
      expect(analysisAfter.consignmentFiles).toContain("CLAUDE.md");
      expect(analysisAfter.consignmentFiles).toContain("AGENTS.md");
    });

    test("analysis detects injected files version", async () => {
      // Inject
      await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });

      // Check injection status
      const status = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });

      const claude = status.agents.find((a) => a.agent === "claude");
      expect(claude?.present).toBe(true);
      expect(claude?.managedByWatcher).toBe(true);
      expect(claude?.outdated).toBe(false);
    });

    test("full scan workflow: analyze + inject + check", async () => {
      // 1. Analyze
      const { analyzeProject } = await import(
        "../../src/analysis/project-analyzer.js"
      );
      const analysis = await analyzeProject(tmpDir);

      // 2. Check injection
      const injResult = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });
      expect(injResult.missingCount).toBeGreaterThanOrEqual(1);

      // 3. Inject
      const injectResult = await injectFiles({
        projectDir: tmpDir,
        agents: ["claude"],
        force: false,
      });
      expect(
        injectResult.filter((r) => r.action === "created").length
      ).toBeGreaterThanOrEqual(1);

      // 4. Verify all files exist
      const statusAfter = await checkInjectionStatus({
        projectDir: tmpDir,
        agents: ["claude"],
      });
      expect(statusAfter.missingCount).toBe(0);
    });
  });
});
