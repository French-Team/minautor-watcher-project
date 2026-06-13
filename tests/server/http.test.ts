import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import http from "http";
import {
  HealthHttpServer,
  createHealthHttpServer,
} from "../../src/server/http.js";
import type { ServiceStatus, ServiceMetrics } from "../../src/types/common.js";

function fetch(
  port: number,
  path: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", reject);
  });
}

const mockMetrics: ServiceMetrics = {
  filesProcessed: 42,
  filesCorrected: 10,
  filesFailed: 2,
  totalProcessingTime: 1500,
  startTime: new Date("2026-01-01T00:00:00Z"),
  lastFileTime: null,
};

const mockStatus: ServiceStatus = {
  initialized: true,
  running: true,
  metrics: mockMetrics,
  modules: {
    detection: { isRunning: true },
    prevention: { isRunning: true },
  },
};

describe("HealthHttpServer", () => {
  let server: HealthHttpServer;
  const PORT = 19876;

  beforeAll(async () => {
    server = new HealthHttpServer(PORT, {
      getStatus: () => mockStatus,
      getMetrics: () => mockMetrics,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("GET /health returns 200 with status", async () => {
    const res = await fetch(PORT, "/health");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.initialized).toBe(true);
    expect(body.modules).toBeDefined();
  });

  it("GET /ready returns 200 when initialized", async () => {
    const res = await fetch(PORT, "/ready");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ready).toBe(true);
  });

  it("GET /metrics returns Prometheus format", async () => {
    const res = await fetch(PORT, "/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toContain("watcher_files_processed_total 42");
    expect(res.body).toContain("watcher_files_corrected_total 10");
    expect(res.body).toContain("watcher_files_failed_total 2");
  });

  it("GET /unknown returns 404", async () => {
    const res = await fetch(PORT, "/unknown");
    expect(res.status).toBe(404);
  });

  it("GET /health returns 503 when stopped", async () => {
    const stoppedServer = new HealthHttpServer(19877, {
      getStatus: () => ({
        ...mockStatus,
        running: false,
      }),
      getMetrics: () => mockMetrics,
    });
    await stoppedServer.start();
    const res = await fetch(19877, "/health");
    expect(res.status).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("stopped");
    await stoppedServer.stop();
  });

  it("GET /ready returns 503 when not initialized", async () => {
    const notInitServer = new HealthHttpServer(19878, {
      getStatus: () => ({
        ...mockStatus,
        initialized: false,
      }),
      getMetrics: () => mockMetrics,
    });
    await notInitServer.start();
    const res = await fetch(19878, "/ready");
    expect(res.status).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.ready).toBe(false);
    await notInitServer.stop();
  });
});

describe("createHealthHttpServer", () => {
  it("returns null if port is undefined", () => {
    const result = createHealthHttpServer(undefined, {
      getStatus: () => mockStatus,
      getMetrics: () => mockMetrics,
    });
    expect(result).toBeNull();
  });

  it("returns a HealthHttpServer if port is provided", () => {
    const result = createHealthHttpServer(19879, {
      getStatus: () => mockStatus,
      getMetrics: () => mockMetrics,
    });
    expect(result).toBeInstanceOf(HealthHttpServer);
  });
});
