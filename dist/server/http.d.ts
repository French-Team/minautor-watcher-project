import type { ServiceStatus, ServiceMetrics } from "../types/common.js";
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
export declare class HealthHttpServer {
    private server;
    private port;
    private deps;
    constructor(port: number, deps: HttpServerDependencies);
    /**
     * Start the HTTP server
     */
    start(): Promise<void>;
    /**
     * Stop the HTTP server
     */
    stop(): Promise<void>;
    /**
     * GET /health - detailed health status
     */
    private handleHealth;
    /**
     * GET /ready - readiness probe (200 if initialized, 503 otherwise)
     */
    private handleReady;
    /**
     * GET /metrics - Prometheus-style metrics
     */
    private handleMetrics;
}
/**
 * Create an HTTP server if PORT is set
 */
export declare function createHealthHttpServer(port: number | undefined, deps: HttpServerDependencies): HealthHttpServer | null;
//# sourceMappingURL=http.d.ts.map