import {
  getSystemInfo,
  formatSystemInfo,
} from "../../src/environment/system-info.js";
import { CURRENT_YEAR } from "../../src/environment/types.js";

describe("SystemInfo", () => {
  it("should return valid system info", async () => {
    const info = await getSystemInfo();

    expect(info).toBeDefined();
    expect(info.platform).toBeDefined();
    expect(info.arch).toBeDefined();
    expect(info.osType).toBeDefined();
    expect(info.osRelease).toBeDefined();
    expect(info.hostname).toBeDefined();
    expect(info.username).toBeDefined();
    expect(info.nodeVersion).toBeDefined();
    expect(info.currentYear).toBe(CURRENT_YEAR);
    expect(info.currentDate).toBeInstanceOf(Date);
    expect(info.timezone).toBeDefined();
  });

  it("should have valid numeric values", async () => {
    const info = await getSystemInfo();

    expect(info.totalMemoryGB).toBeGreaterThan(0);
    expect(info.cpuCount).toBeGreaterThan(0);
    expect(info.systemUptimeHours).toBeGreaterThanOrEqual(0);
  });

  it("should detect current year", async () => {
    const info = await getSystemInfo();
    expect(info.currentYear).toBe(new Date().getFullYear());
  });

  it("should detect platform", async () => {
    const info = await getSystemInfo();
    expect(["win32", "linux", "darwin"]).toContain(info.platform);
  });

  it("should format system info", async () => {
    const info = await getSystemInfo();
    const formatted = formatSystemInfo(info);

    expect(formatted).toContain("Platform");
    expect(formatted).toContain("OS");
    expect(formatted).toContain("Host");
    expect(formatted).toContain("Node.js");
    expect(formatted).toContain("CPU");
    expect(formatted).toContain("RAM");
    expect(formatted).toContain("Year");
  });
});
