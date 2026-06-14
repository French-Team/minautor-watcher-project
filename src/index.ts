import dotenv from "dotenv";
import { pathToFileURL } from "url";
import { createDetectionModule, DetectionModule } from "./detection/index.js";
import { EventUtils } from "./detection/events.js";
import {
  createPreventionModule,
  PreventionModule,
  PreventionResult,
} from "./prevention/index.js";
import { createTriggerModule, TriggerModule } from "./trigger/index.js";
import logger from "./shared/logger.js";
import { createHealthHttpServer, HealthHttpServer } from "./server/http.js";
import type {
  WatcherServiceConfig,
  ServiceMetrics,
  ServiceStatus,
} from "./types/common.js";

// Re-export for backward compatibility
export type { ServiceMetrics } from "./types/common.js";
export {
  CURRENT_YEAR,
  WATCHER_VERSION,
  getSystemInfo,
  detectTools,
  detectDevEnvironment,
  generateEnvReport,
  printBanner,
  printCompactBanner,
} from "./environment/index.js";

// Load environment variables
dotenv.config({ path: ".env.local" });

/**
 * Main Watcher Service class that orchestrates all modules
 */
export class WatcherService {
  private detectionModule?: DetectionModule;
  private preventionModule?: PreventionModule;
  private triggerModule?: TriggerModule;
  private httpServer: HealthHttpServer | null = null;
  private config: WatcherServiceConfig;
  private isRunning: boolean = false;
  private draining: boolean = false;
  private activeTasks: number = 0;
  private drainResolvers: Array<() => void> = [];
  private metrics: ServiceMetrics = {
    filesProcessed: 0,
    filesCorrected: 0,
    filesFailed: 0,
    totalProcessingTime: 0,
    startTime: null,
    lastFileTime: null,
  };

  constructor(config: WatcherServiceConfig = {}) {
    this.config = {
      watchDir: process.env.WATCH_DIR || process.cwd(),
      enablePrevention: true,
      enableTrigger: true,
      port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
      ...config,
    };
  }

  getMetrics(): ServiceMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      filesProcessed: 0,
      filesCorrected: 0,
      filesFailed: 0,
      totalProcessingTime: 0,
      startTime: null,
      lastFileTime: null,
    };
  }

  getPreventionModule(): PreventionModule | undefined {
    return this.preventionModule;
  }

  getTriggerModule(): TriggerModule | undefined {
    return this.triggerModule;
  }

  /**
   * Initialize all modules
   */
  async initialize(): Promise<void> {
    logger.info("Initializing Watcher Service...");

    try {
      // Initialize detection module
      this.detectionModule = createDetectionModule({
        watchDir: this.config.watchDir,
      });

      // Initialize prevention module (if enabled)
      if (this.config.enablePrevention !== false) {
        this.preventionModule = await createPreventionModule();
      } else {
        logger.info("Prevention module disabled via configuration");
      }

      // Initialize trigger module (if enabled)
      if (this.config.enableTrigger !== false) {
        this.triggerModule = createTriggerModule();
      } else {
        logger.info("Trigger module disabled via configuration");
      }

      // Set up module communication
      this.setupModuleCommunication();

      // Start HTTP health server if port configured
      if (this.config.port) {
        this.httpServer = createHealthHttpServer(this.config.port, {
          getStatus: () => this.getStatus(),
          getMetrics: () => this.getMetrics(),
        });
        if (this.httpServer) {
          await this.httpServer.start();
        }
      }

      logger.success("Watcher Service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Watcher Service:", error);
      throw error;
    }
  }

  /**
   * Start the watcher service
   */
  async start(): Promise<void> {
    if (
      !this.detectionModule ||
      !this.preventionModule ||
      !this.triggerModule
    ) {
      throw new Error(
        "Watcher Service not initialized. Call initialize() first."
      );
    }

    logger.info("Starting Watcher Service...");

    try {
      // Start all modules
      await Promise.all([
        this.detectionModule.start(),
        this.preventionModule.start(),
        this.triggerModule.start(),
      ]);

      logger.success("Watcher Service started successfully");
      this.isRunning = true;

      // Register signal handlers for graceful shutdown
      const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await this.stop();
        process.exit(0);
      };

      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));

      // USR1 = reload config, USR2 = graceful restart (Unix only)
      if (typeof process.on === "function") {
        process.on("SIGUSR1", () => {
          logger.info("Received SIGUSR1, reloading configuration...");
          this.reloadConfig().catch((err) => {
            logger.error("Failed to reload config:", err);
          });
        });

        process.on("SIGUSR2", async () => {
          logger.info("Received SIGUSR2, performing graceful restart...");
          await this.stop();
          await this.initialize();
          await this.start();
        });
      }
    } catch (error) {
      logger.error("Failed to start Watcher Service:", error);
      throw error;
    }
  }

  /**
   * Stop the watcher service (graceful drain with configurable timeout)
   */
  async stop(): Promise<void> {
    logger.info("Stopping Watcher Service...");

    try {
      // Stop HTTP server first
      if (this.httpServer) {
        await this.httpServer.stop();
        this.httpServer = null;
      }

      // Enter drain mode: ignore new events, wait for in-flight
      this.draining = true;
      const drainTimeout = this.config.drainTimeout || 10000;

      if (this.activeTasks > 0) {
        logger.info(
          `Draining ${this.activeTasks} active task(s) (timeout: ${drainTimeout}ms)...`
        );
        await Promise.race([
          this.waitForDrain(),
          new Promise<void>((resolve) => setTimeout(resolve, drainTimeout)),
        ]);
        if (this.activeTasks > 0) {
          logger.warn(
            `Drain timed out with ${this.activeTasks} task(s) still active`
          );
        }
      }

      // Stop all modules
      await Promise.all(
        [
          this.detectionModule?.stop(),
          this.preventionModule?.stop(),
          this.triggerModule?.stop(),
        ].filter(Boolean)
      );

      logger.success("Watcher Service stopped successfully");
      this.isRunning = false;
      this.draining = false;
    } catch (error) {
      logger.error("Error stopping Watcher Service:", error);
      throw error;
    }
  }

  private waitForDrain(): Promise<void> {
    if (this.activeTasks === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  private beginTask(): void {
    this.activeTasks++;
  }

  private endTask(): void {
    this.activeTasks--;
    if (this.activeTasks <= 0 && this.draining) {
      this.activeTasks = 0;
      for (const resolve of this.drainResolvers) resolve();
      this.drainResolvers = [];
    }
  }

  /**
   * Whether the service is in drain mode
   */
  isDraining(): boolean {
    return this.draining;
  }

  /**
   * Set up communication between modules
   */
  private setupModuleCommunication(): void {
    if (!this.detectionModule) {
      return;
    }

    // Set up event forwarding from detection to prevention and trigger
    this.detectionModule.eventBus.on(
      "fileDetected",
      EventUtils.wrapAsyncHandler(async (event) => {
        if (this.draining) {
          logger.debug(
            `Ignoring file event during drain: ${event.file.filePath}`
          );
          return;
        }

        this.beginTask();
        const startTime = Date.now();
        try {
          this.metrics.filesProcessed++;
          this.metrics.lastFileTime = new Date();

          // Process file through prevention module (if available)
          let preventionResult: PreventionResult = {
            filePath: event.file.filePath,
            success: true,
            errors: [],
            warnings: [],
            executionTime: 0,
          };
          if (this.preventionModule) {
            preventionResult = await this.preventionModule.processFile(
              event.file.filePath
            );
          }

          // Trigger corrections (if available)
          if (this.triggerModule) {
            if (
              preventionResult.success ||
              preventionResult.warnings.length > 0
            ) {
              await this.triggerModule.processEvent({
                filePath: event.file.filePath,
                eventType: "fileDetected",
                metadata: { preventionResult },
                timestamp: new Date(),
              });
            }

            // If prevention fails, send notification
            if (!preventionResult.success) {
              this.metrics.filesFailed++;
              await this.triggerModule.processEvent({
                filePath: event.file.filePath,
                eventType: "preventionFailed",
                error: {
                  message: `Prevention failed: ${preventionResult.errors.length} errors`,
                  preventionResult,
                },
                timestamp: new Date(),
              });
            } else {
              this.metrics.filesCorrected++;
            }
          }

          this.metrics.totalProcessingTime += Date.now() - startTime;
        } catch (error) {
          this.metrics.filesFailed++;
          logger.error("Error in detection event handling:", error);
        } finally {
          this.endTask();
        }
      })
    );

    this.detectionModule.eventBus.on(
      "fileModified",
      EventUtils.wrapAsyncHandler(async (event) => {
        if (this.draining) {
          return;
        }

        this.beginTask();
        const startTime = Date.now();
        try {
          this.metrics.filesProcessed++;
          this.metrics.lastFileTime = new Date();

          // Process file through prevention module (if available)
          let preventionResult: PreventionResult = {
            filePath: event.file.filePath,
            success: true,
            errors: [],
            warnings: [],
            executionTime: 0,
          };
          if (this.preventionModule) {
            preventionResult = await this.preventionModule.processFile(
              event.file.filePath
            );
          }

          // Trigger corrections (if available)
          if (this.triggerModule) {
            await this.triggerModule.processEvent({
              filePath: event.file.filePath,
              eventType: "fileModified",
              metadata: { preventionResult },
              timestamp: new Date(),
            });
          }

          if (preventionResult.success) {
            this.metrics.filesCorrected++;
          } else {
            this.metrics.filesFailed++;
          }
          this.metrics.totalProcessingTime += Date.now() - startTime;
        } catch (error) {
          this.metrics.filesFailed++;
          logger.error("Error in file modification handling:", error);
        } finally {
          this.endTask();
        }
      })
    );

    this.detectionModule.eventBus.on(
      "fileDeleted",
      EventUtils.wrapAsyncHandler(async (event) => {
        if (this.draining) {
          return;
        }

        this.beginTask();
        try {
          if (this.triggerModule) {
            await this.triggerModule.processEvent({
              filePath: event.file.filePath,
              eventType: "fileDeleted",
              timestamp: new Date(),
            });
          }
        } catch (error) {
          logger.error("Error in file deletion handling:", error);
        } finally {
          this.endTask();
        }
      })
    );

    logger.success("Module communication setup completed");
  }

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    return {
      initialized: Boolean(
        this.detectionModule && this.preventionModule && this.triggerModule
      ),
      running: this.isRunning,
      metrics: this.getMetrics(),
      modules: {
        detection: this.detectionModule?.getStatus(),
        prevention: this.preventionModule?.getStatus(),
        trigger: this.triggerModule?.getStatus(),
      },
    };
  }

  /**
   * Reload configuration for all modules
   */
  async reloadConfig(): Promise<void> {
    logger.info("Reloading configuration...");

    try {
      await Promise.all(
        [
          this.detectionModule?.reloadConfig(),
          this.preventionModule?.reloadConfig(),
          this.triggerModule?.reloadConfig(),
        ].filter(Boolean)
      );

      logger.success("Configuration reloaded successfully");
    } catch (error) {
      logger.error("Error reloading configuration:", error);
      throw error;
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { WatcherCLI } = await import("./cli/index.js");
  const cli = new WatcherCLI();
  await cli.run();
}

/**
 * Export for programmatic usage
 */
export default WatcherService;

// Run CLI if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}
