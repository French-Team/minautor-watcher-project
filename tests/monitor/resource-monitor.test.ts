import { ResourceMonitor, createResourceMonitor } from "../../src/monitor/resource-monitor.js";

describe("ResourceMonitor", () => {
  let monitor: ResourceMonitor;

  afterEach(() => {
    monitor?.stop();
  });

  it("should create with default config", () => {
    monitor = createResourceMonitor();
    expect(monitor).toBeInstanceOf(ResourceMonitor);
    expect(monitor.getSnapshot()).toBeNull();
  });

  it("should collect a snapshot when started", async () => {
    monitor = createResourceMonitor({ intervalMs: 100, logStats: false });
    monitor.start();

    await new Promise((r) => setTimeout(r, 150));

    const snapshot = monitor.getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.cpu.cores).toBeGreaterThan(0);
    expect(snapshot!.cpu.usagePercent).toBeGreaterThanOrEqual(0);
    expect(snapshot!.cpu.usagePercent).toBeLessThanOrEqual(100);
    expect(snapshot!.memory.totalMB).toBeGreaterThan(0);
    expect(snapshot!.memory.usagePercent).toBeGreaterThanOrEqual(0);
    expect(snapshot!.heap.usedMB).toBeGreaterThan(0);
  });

  it("should stop collecting after stop()", async () => {
    monitor = createResourceMonitor({ intervalMs: 100, logStats: false });
    monitor.start();
    await new Promise((r) => setTimeout(r, 150));

    const count1 = monitor.getSnapshots().length;
    monitor.stop();

    await new Promise((r) => setTimeout(r, 250));
    const count2 = monitor.getSnapshots().length;

    expect(count2).toBe(count1);
  });

  it("should calculate average CPU", async () => {
    monitor = createResourceMonitor({ intervalMs: 50, logStats: false });
    monitor.start();
    await new Promise((r) => setTimeout(r, 200));

    const avg = monitor.getAvgCpu(5);
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThanOrEqual(100);
  });

  it("should track peak memory", async () => {
    monitor = createResourceMonitor({ intervalMs: 50, logStats: false });
    monitor.start();
    await new Promise((r) => setTimeout(r, 200));

    const peak = monitor.getPeakMemory();
    expect(peak).toBeGreaterThanOrEqual(0);
    expect(peak).toBeLessThanOrEqual(100);
  });

  it("should handle multiple start/stop cycles", async () => {
    monitor = createResourceMonitor({ intervalMs: 50, logStats: false });

    monitor.start();
    await new Promise((r) => setTimeout(r, 100));
    monitor.stop();

    monitor.start();
    await new Promise((r) => setTimeout(r, 100));
    monitor.stop();

    const snapshots = monitor.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
  });
});
