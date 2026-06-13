import http from "http";
import { createChildLogger } from "../shared/logger.js";
import type { ServiceStatus, ServiceMetrics } from "../types/common.js";

const logger = createChildLogger("http-server");

/**
 * Dependencies injected into the HTTP server
 */
export interface HttpServerDependencies {
  getStatus: () => ServiceStatus;
  getMetrics: () => ServiceMetrics;
}

/**
 * Minimal HTTP server for health checks and metrics.
 * Uses node:http only (no Express).
 */
export class HealthHttpServer {
  private server: http.Server | null = null;
  private port: number;
  private deps: HttpServerDependencies;

  constructor(port: number, deps: HttpServerDependencies) {
    this.port = port;
    this.deps = deps;
  }

  /**
   * Start the HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (
        req: http.IncomingMessage,
        res: http.ServerResponse
      ): void => {
        const url = req.url || "/";

        if (req.method === "GET" && url === "/health") {
          this.handleHealth(res);
        } else if (req.method === "GET" && url === "/ready") {
          this.handleReady(res);
        } else if (req.method === "GET" && url === "/metrics") {
          this.handleMetrics(res);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
        }
      };

      this.server = http.createServer(handler);

      this.server.on("error", (err) => {
        logger.error(`HTTP server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.port, () => {
        logger.info(`Health check server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info("HTTP server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * GET /health - detailed health status
   */
  private handleHealth(res: http.ServerResponse): void {
    const status = this.deps.getStatus();
    const body = {
      status: status.running ? "ok" : "stopped",
      uptime: status.metrics.startTime
        ? Math.floor((Date.now() - status.metrics.startTime.getTime()) / 1000)
        : 0,
      initialized: status.initialized,
      modules: status.modules,
    };
    const code = status.running ? 200 : 503;
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  /**
   * GET /ready - readiness probe (200 if initialized, 503 otherwise)
   */
  private handleReady(res: http.ServerResponse): void {
    const status = this.deps.getStatus();
    const code = status.initialized ? 200 : 503;
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ready: status.initialized }));
  }

  /**
   * GET /metrics - Prometheus-style metrics
   */
  private handleMetrics(res: http.ServerResponse): void {
    const metrics = this.deps.getMetrics();
    const lines = [
      `# HELP watcher_files_processed_total Total files processed`,
      `# TYPE watcher_files_processed_total counter`,
      `watcher_files_processed_total ${metrics.filesProcessed}`,
      `# HELP watcher_files_corrected_total Total files corrected`,
      `# TYPE watcher_files_corrected_total counter`,
      `watcher_files_corrected_total ${metrics.filesCorrected}`,
      `# HELP watcher_files_failed_total Total files failed`,
      `# TYPE watcher_files_failed_total counter`,
      `watcher_files_failed_total ${metrics.filesFailed}`,
      `# HELP watcher_processing_time_ms Total processing time in ms`,
      `# TYPE watcher_processing_time_ms counter`,
      `watcher_processing_time_ms ${metrics.totalProcessingTime}`,
      `# HELP watcher_uptime_seconds Service uptime in seconds`,
      `# TYPE watcher_uptime_seconds gauge`,
      `watcher_uptime_seconds ${
        metrics.startTime
          ? Math.floor((Date.now() - metrics.startTime.getTime()) / 1000)
          : 0
      }`,
    ];
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
    res.end(lines.join("\n") + "\n");
  }
}

/**
 * Create an HTTP server if PORT is set
 */
export function createHealthHttpServer(
  port: number | undefined,
  deps: HttpServerDependencies
): HealthHttpServer | null {
  if (!port) return null;
  return new HealthHttpServer(port, deps);
}
