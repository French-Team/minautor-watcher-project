import path from "path";
import os from "os";
import fs from "fs-extra";
import {
  loadUnifiedConfig,
  saveUnifiedConfig,
  WatcherConfig,
} from "../../src/shared/unified-config.js";

describe("Unified Config", () => {
  const testDir = path.join(
    os.tmpdir(),
    `watcher-test-unified-config-${Date.now()}`
  );

  beforeAll(() => {
    fs.ensureDirSync(testDir);
  });

  afterAll(() => {
    fs.removeSync(testDir);
  });

  it("should load default config when no files exist", () => {
    const config = loadUnifiedConfig(testDir);
    expect(config).toBeDefined();
    expect(config.watchDir).toBeDefined();
  });

  it("should save and load unified config", () => {
    const testConfig: WatcherConfig = {
      watchDir: "./test-src",
      excludedDirs: ["node_modules"],
      watchExtensions: ["ts"],
      processingDelay: 200,
    };

    saveUnifiedConfig(testConfig, testDir);

    const loaded = loadUnifiedConfig(testDir);
    expect(loaded.watchDir).toBe("./test-src");
    expect(loaded.excludedDirs).toEqual(["node_modules"]);
    expect(loaded.watchExtensions).toEqual(["ts"]);
    expect(loaded.processingDelay).toBe(200);
  });

  it("should load legacy configs when unified does not exist", () => {
    // Ensure no unified config exists
    const unifiedPath = path.join(testDir, "watcher.config.json");
    if (fs.existsSync(unifiedPath)) {
      fs.removeSync(unifiedPath);
    }

    // Write legacy configs
    const legacyPrevention = {
      enabled: true,
      rules: [{ id: "test-rule" }],
    };
    fs.writeJsonSync(
      path.join(testDir, "prevention-rules.json"),
      legacyPrevention
    );

    const legacyTrigger = {
      rules: [{ id: "trigger-rule" }],
    };
    fs.writeJsonSync(path.join(testDir, "trigger-rules.json"), legacyTrigger);

    const config = loadUnifiedConfig(testDir);
    expect(config.prevention).toBeDefined();
    expect(config.trigger).toBeDefined();

    // Cleanup
    fs.removeSync(path.join(testDir, "prevention-rules.json"));
    fs.removeSync(path.join(testDir, "trigger-rules.json"));
  });

  it("should prefer unified config over legacy", () => {
    // Write both
    const unified: WatcherConfig = {
      watchDir: "./unified-src",
    };
    fs.writeJsonSync(path.join(testDir, "watcher.config.json"), unified);

    const legacy = {
      watchDir: "./legacy-src",
    };
    fs.writeJsonSync(path.join(testDir, "prevention-rules.json"), legacy);

    const config = loadUnifiedConfig(testDir);
    expect(config.watchDir).toBe("./unified-src");

    // Cleanup
    fs.removeSync(path.join(testDir, "watcher.config.json"));
    fs.removeSync(path.join(testDir, "prevention-rules.json"));
  });
});
