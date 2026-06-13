import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  PreventionConfigManager,
  createPreventionConfig,
} from "../../src/prevention/config.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-config");

describe("PreventionConfigManager", () => {
  let configPath: string;

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  beforeEach(async () => {
    configPath = path.join(TEST_DIR, `config-${Date.now()}.json`);
  });

  describe("constructor", () => {
    it("should use default config when file does not exist", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const config = manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.rules.length).toBeGreaterThan(0);
      expect(config.globalSettings.failOnError).toBe(true);
    });

    it("should load config from valid file", async () => {
      const validConfig = {
        enabled: true,
        rules: [
          {
            id: "test-rule",
            name: "Test Rule",
            description: "A test rule",
            enabled: true,
            severity: "error",
            category: "syntax",
            validators: ["eslint"],
            scripts: [],
          },
        ],
        globalSettings: {
          failOnError: true,
          failOnWarning: false,
          maxExecutionTime: 30000,
          parallelExecution: true,
        },
      };
      await fs.writeJson(configPath, validConfig);
      const manager = await PreventionConfigManager.create(configPath);
      const config = manager.getConfig();
      expect(config.rules).toHaveLength(1);
      expect(config.rules[0].id).toBe("test-rule");
    });

    it("should fall back to defaults on invalid file", async () => {
      await fs.writeFile(configPath, "{ broken json");
      const manager = await PreventionConfigManager.create(configPath);
      const config = manager.getConfig();
      expect(config.rules.length).toBeGreaterThan(0);
    });
  });

  describe("getEnabledRules", () => {
    it("should return only enabled rules", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const enabled = manager.getEnabledRules();
      expect(enabled.length).toBeGreaterThan(0);
      enabled.forEach((rule) => {
        expect(rule.enabled).toBe(true);
      });
    });
  });

  describe("getRulesForFile", () => {
    it("should return rules matching file extension", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const tsRules = await manager.getRulesForFile("test.ts");
      expect(tsRules.length).toBeGreaterThan(0);
      tsRules.forEach((rule) => {
        expect(rule.conditions?.fileExtensions).toContain("ts");
      });
    });

    it("should return empty for unmatched extension", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const rules = await manager.getRulesForFile("image.png");
      expect(rules).toHaveLength(0);
    });
  });

  describe("addRule", () => {
    it("should add a new rule", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const initialCount = manager.getConfig().rules.length;
      await manager.addRule({
        id: "new-rule",
        name: "New Rule",
        description: "A new rule",
        enabled: true,
        severity: "warning",
        category: "custom",
        validators: [],
        scripts: [],
      });
      expect(manager.getConfig().rules.length).toBe(initialCount + 1);
    });

    it("should update existing rule with same id", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      await manager.addRule({
        id: "update-rule",
        name: "Original",
        description: "Original desc",
        enabled: true,
        severity: "info",
        category: "custom",
        validators: [],
        scripts: [],
      });
      await manager.addRule({
        id: "update-rule",
        name: "Updated",
        description: "Updated desc",
        enabled: false,
        severity: "error",
        category: "custom",
        validators: [],
        scripts: [],
      });
      const rule = manager
        .getConfig()
        .rules.find((r) => r.id === "update-rule");
      expect(rule?.name).toBe("Updated");
      expect(rule?.enabled).toBe(false);
    });
  });

  describe("removeRule", () => {
    it("should remove a rule by id", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      await manager.addRule({
        id: "to-remove",
        name: "To Remove",
        description: "Will be removed",
        enabled: true,
        severity: "info",
        category: "custom",
        validators: [],
        scripts: [],
      });
      const removed = await manager.removeRule("to-remove");
      expect(removed).toBe(true);
      expect(
        manager.getConfig().rules.find((r) => r.id === "to-remove")
      ).toBeUndefined();
    });

    it("should return false for non-existent rule", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const removed = await manager.removeRule("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("toggleRule", () => {
    it("should toggle rule enabled status", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      await manager.addRule({
        id: "toggle-test",
        name: "Toggle Test",
        description: "Test toggle",
        enabled: true,
        severity: "info",
        category: "custom",
        validators: [],
        scripts: [],
      });
      const toggled = await manager.toggleRule("toggle-test", false);
      expect(toggled).toBe(true);
      const rule = manager
        .getConfig()
        .rules.find((r) => r.id === "toggle-test");
      expect(rule?.enabled).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const stats = manager.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);
      expect(stats.enabledRules).toBeGreaterThan(0);
      expect(stats.rulesByCategory).toBeDefined();
      expect(stats.rulesBySeverity).toBeDefined();
    });
  });

  describe("reloadConfig", () => {
    it("should reload configuration from file", async () => {
      const manager = await PreventionConfigManager.create(configPath);
      const newConfig = {
        enabled: true,
        rules: [
          {
            id: "reloaded-rule",
            name: "Reloaded",
            description: "Reloaded rule",
            enabled: true,
            severity: "info",
            category: "custom",
            validators: [],
            scripts: [],
          },
        ],
        globalSettings: {
          failOnError: true,
          failOnWarning: false,
          maxExecutionTime: 30000,
          parallelExecution: true,
        },
      };
      await fs.writeJson(configPath, newConfig);
      await manager.reloadConfig();
      expect(manager.getConfig().rules).toHaveLength(1);
      expect(manager.getConfig().rules[0].id).toBe("reloaded-rule");
    });
  });

  describe("createPreventionConfig", () => {
    it("should create a config manager instance", async () => {
      const manager = await createPreventionConfig(configPath);
      expect(manager).toBeInstanceOf(PreventionConfigManager);
    });
  });
});
