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
  TriggerRuleManager,
  createTriggerRuleManager,
} from "../../src/trigger/rules.js";

const TEST_DIR = path.join(os.tmpdir(), "watcher-test-rules");

describe("TriggerRuleManager", () => {
  let configPath: string;

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  beforeEach(async () => {
    configPath = path.join(TEST_DIR, `rules-${Date.now()}.json`);
  });

  describe("constructor", () => {
    it("should load default rules when no config file exists", () => {
      const manager = new TriggerRuleManager(configPath);
      const rules = manager.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it("should load rules from valid config file", async () => {
      const config = {
        rules: [
          {
            id: "test-rule",
            name: "Test Rule",
            description: "A test rule",
            enabled: true,
            priority: 5,
            conditions: { eventTypes: ["fileModified"] },
            actions: [{ type: "log" }],
          },
        ],
      };
      await fs.writeJson(configPath, config);
      const manager = new TriggerRuleManager(configPath);
      expect(manager.getRules()).toHaveLength(1);
      expect(manager.getRules()[0].id).toBe("test-rule");
    });

    it("should handle legacy config format", async () => {
      const legacyConfig = {
        corrections: [
          {
            ruleId: "legacy-rule",
            description: "Legacy correction",
            action: "replace",
            pattern: "old",
            replacement: "new",
            extensions: ["ts"],
          },
        ],
        conditions: [],
        notifications: { onFailure: true },
      };
      await fs.writeJson(configPath, legacyConfig);
      const manager = new TriggerRuleManager(configPath);
      expect(manager.getRules().length).toBeGreaterThan(0);
    });
  });

  describe("getEnabledRules", () => {
    it("should return only enabled rules", () => {
      const manager = new TriggerRuleManager(configPath);
      const enabled = manager.getEnabledRules();
      enabled.forEach((rule) => {
        expect(rule.enabled).toBe(true);
      });
    });
  });

  describe("getApplicableRules", () => {
    it("should match rules by event type", () => {
      const manager = new TriggerRuleManager(configPath);
      const context = {
        filePath: "/test/file.ts",
        eventType: "fileModified",
        timestamp: new Date(),
      };
      const applicable = manager.getApplicableRules(context);
      expect(applicable.length).toBeGreaterThan(0);
      applicable.forEach((rule) => {
        expect(rule.conditions.eventTypes).toContain("fileModified");
      });
    });

    it("should match rules by file extension", async () => {
      const config = {
        rules: [
          {
            id: "ts-only",
            name: "TS Only",
            description: "Only for TS files",
            enabled: true,
            priority: 1,
            conditions: {
              eventTypes: ["fileModified"],
              fileExtensions: ["ts"],
            },
            actions: [{ type: "log" }],
          },
        ],
      };
      await fs.writeJson(configPath, config);
      const manager = new TriggerRuleManager(configPath);

      const tsContext = {
        filePath: "/test/file.ts",
        eventType: "fileModified",
        timestamp: new Date(),
      };
      const jsContext = {
        filePath: "/test/file.js",
        eventType: "fileModified",
        timestamp: new Date(),
      };
      expect(manager.getApplicableRules(tsContext)).toHaveLength(1);
      expect(manager.getApplicableRules(jsContext)).toHaveLength(0);
    });

    it("should sort rules by priority descending", () => {
      const manager = new TriggerRuleManager(configPath);
      const context = {
        filePath: "/test/file.ts",
        eventType: "fileModified",
        timestamp: new Date(),
      };
      const applicable = manager.getApplicableRules(context);
      for (let i = 1; i < applicable.length; i++) {
        expect(applicable[i - 1].priority).toBeGreaterThanOrEqual(
          applicable[i].priority
        );
      }
    });
  });

  describe("addRule", () => {
    it("should add a new rule", async () => {
      const manager = new TriggerRuleManager(configPath);
      const initialCount = manager.getRules().length;
      await manager.addRule({
        id: "added-rule",
        name: "Added Rule",
        description: "Added dynamically",
        enabled: true,
        priority: 1,
        conditions: { eventTypes: ["fileModified"] },
        actions: [{ type: "log" }],
      });
      expect(manager.getRules().length).toBe(initialCount + 1);
    });

    it("should update existing rule with same id", async () => {
      const manager = new TriggerRuleManager(configPath);
      await manager.addRule({
        id: "update-me",
        name: "Original",
        description: "Original",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [{ type: "log" }],
      });
      await manager.addRule({
        id: "update-me",
        name: "Updated",
        description: "Updated",
        enabled: false,
        priority: 2,
        conditions: {},
        actions: [{ type: "log" }],
      });
      const rule = manager.getRules().find((r) => r.id === "update-me");
      expect(rule?.name).toBe("Updated");
      expect(rule?.enabled).toBe(false);
    });
  });

  describe("removeRule", () => {
    it("should remove a rule", async () => {
      const manager = new TriggerRuleManager(configPath);
      await manager.addRule({
        id: "remove-me",
        name: "Remove Me",
        description: "To be removed",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [{ type: "log" }],
      });
      const removed = await manager.removeRule("remove-me");
      expect(removed).toBe(true);
      expect(
        manager.getRules().find((r) => r.id === "remove-me")
      ).toBeUndefined();
    });

    it("should return false for non-existent rule", async () => {
      const manager = new TriggerRuleManager(configPath);
      expect(await manager.removeRule("non-existent")).toBe(false);
    });
  });

  describe("toggleRule", () => {
    it("should toggle rule enabled status", async () => {
      const manager = new TriggerRuleManager(configPath);
      await manager.addRule({
        id: "toggle-me",
        name: "Toggle Me",
        description: "Toggle test",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [{ type: "log" }],
      });
      await manager.toggleRule("toggle-me", false);
      const rule = manager.getRules().find((r) => r.id === "toggle-me");
      expect(rule?.enabled).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      const manager = new TriggerRuleManager(configPath);
      const stats = manager.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);
      expect(typeof stats.rulesByPriority).toBe("object");
    });
  });

  describe("exportConfig / importConfig", () => {
    it("should export and import configuration", async () => {
      const manager = new TriggerRuleManager(configPath);
      await manager.addRule({
        id: "export-test",
        name: "Export Test",
        description: "Test export",
        enabled: true,
        priority: 1,
        conditions: {},
        actions: [{ type: "log" }],
      });
      const exported = manager.exportConfig();
      expect(exported.rules.length).toBeGreaterThan(0);

      const newManager = new TriggerRuleManager(
        path.join(TEST_DIR, `import-${Date.now()}.json`)
      );
      await newManager.importConfig(exported);
      expect(newManager.getRules().length).toBe(exported.rules.length);
    });
  });

  describe("createTriggerRuleManager", () => {
    it("should create a manager instance", () => {
      const manager = createTriggerRuleManager(configPath);
      expect(manager).toBeInstanceOf(TriggerRuleManager);
    });
  });
});
