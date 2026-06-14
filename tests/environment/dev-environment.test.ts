import { detectDevEnvironment, formatDevEnvironment } from "../../src/environment/dev-environment.js";

describe("DevEnvironment", () => {
  it("should detect dev environment", async () => {
    const env = await detectDevEnvironment();

    expect(env).toBeDefined();
    expect(env.ide).toBeDefined();
    expect(env.shell).toBeDefined();
    expect(env.container).toBeDefined();
  });

  it("should detect shell", async () => {
    const env = await detectDevEnvironment();

    expect(env.shell.name).toBeDefined();
    expect(typeof env.shell.name).toBe("string");
    expect(env.shell.name.length).toBeGreaterThan(0);
  });

  it("should detect IDE (may be null)", async () => {
    const env = await detectDevEnvironment();

    // IDE can be null if no IDE is detected
    if (env.ide.name) {
      expect(typeof env.ide.name).toBe("string");
    }
  });

  it("should detect container status", async () => {
    const env = await detectDevEnvironment();

    expect(typeof env.container.isDocker).toBe("boolean");
    expect(typeof env.container.isWSL).toBe("boolean");
    expect(typeof env.container.isCI).toBe("boolean");
  });

  it("should format dev environment", async () => {
    const env = await detectDevEnvironment();
    const formatted = formatDevEnvironment(env);

    expect(formatted).toContain("IDE");
    expect(formatted).toContain("Shell");
    expect(formatted).toContain("Docker");
    expect(formatted).toContain("WSL");
    expect(formatted).toContain("CI");
  });
});
