import {
  detectTools,
  detectTool,
  getMissingTools,
  getInstallSuggestions,
  isToolAvailable,
  clearToolCache,
} from "../../src/environment/tool-detector.js";

describe("ToolDetector", () => {
  beforeEach(() => {
    clearToolCache();
  });

  it("should detect node (always available in test env)", async () => {
    const tool = await detectTool("node");
    expect(tool.name).toBe("node");
    expect(tool.available).toBe(true);
    expect(tool.version).toBeDefined();
  });

  it("should detect npm (always available in test env)", async () => {
    const tool = await detectTool("npm");
    expect(tool.name).toBe("npm");
    expect(tool.available).toBe(true);
  });

  it("should detect npx (always available in test env)", async () => {
    const tool = await detectTool("npx");
    expect(tool.name).toBe("npx");
    expect(tool.available).toBe(true);
  });

  it("should return install suggestion for missing tools", async () => {
    const tool = await detectTool("eslint");
    expect(tool.installSuggestion).toBeDefined();
    expect(tool.installSuggestion.length).toBeGreaterThan(0);
  });

  it("should detect all tools", async () => {
    const tools = await detectTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.length).toBe(10); // 10 tools configured
  });

  it("should cache results", async () => {
    const tool1 = await detectTool("node");
    const tool2 = await detectTool("node");
    expect(tool1).toBe(tool2); // Same object reference from cache
  });

  it("should clear cache", async () => {
    await detectTool("node");
    clearToolCache();
    // After clearing, next call should create new entry
    const tool = await detectTool("node");
    expect(tool).toBeDefined();
  });

  it("should use isToolAvailable for quick check", async () => {
    const available = await isToolAvailable("node");
    expect(available).toBe(true);
  });

  it("should return missing tools list", async () => {
    const missing = await getMissingTools();
    expect(Array.isArray(missing)).toBe(true);
    // All missing tools should have available=false
    for (const tool of missing) {
      expect(tool.available).toBe(false);
    }
  });

  it("should return install suggestions", async () => {
    const suggestions = await getInstallSuggestions();
    expect(Array.isArray(suggestions)).toBe(true);
    // All suggestions should be strings
    for (const s of suggestions) {
      expect(typeof s).toBe("string");
    }
  });
});
