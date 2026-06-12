import { Command } from "commander";
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import chalk from "chalk";
import { createDetectionModule, DetectionModule } from "./detection/index.js";
import {
  createPreventionModule,
  PreventionModule,
} from "./prevention/index.js";
import { createTriggerModule, TriggerModule } from "./trigger/index.js";
import logger from "./shared/logger.js";
import {
  preventionConfigSchema,
  triggerConfigSchema,
  validateConfig,
} from "./shared/config-schema.js";

// Load environment variables
dotenv.config({ path: ".env.local" });

export interface ServiceMetrics {
  filesProcessed: number;
  filesCorrected: number;
  filesFailed: number;
  totalProcessingTime: number;
  startTime: Date | null;
  lastFileTime: Date | null;
}

/**
 * Main Watcher Service class that orchestrates all modules
 */
export class WatcherService {
  private detectionModule?: DetectionModule;
  private preventionModule?: PreventionModule;
  private triggerModule?: TriggerModule;
  private config: any;
  private isRunning: boolean = false;
  private metrics: ServiceMetrics = {
    filesProcessed: 0,
    filesCorrected: 0,
    filesFailed: 0,
    totalProcessingTime: 0,
    startTime: null,
    lastFileTime: null,
  };

  constructor(config: any = {}) {
    this.config = {
      watchDir: process.env.WATCH_DIR || process.cwd(),
      enablePrevention: true,
      enableTrigger: true,
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
        this.preventionModule = createPreventionModule();
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

      logger.info("Watcher Service initialized successfully");
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

      logger.info("Watcher Service started successfully");
      this.isRunning = true;
    } catch (error) {
      logger.error("Failed to start Watcher Service:", error);
      throw error;
    }
  }

  /**
   * Stop the watcher service
   */
  async stop(): Promise<void> {
    logger.info("Stopping Watcher Service...");

    try {
      // Stop all modules
      await Promise.all(
        [
          this.detectionModule?.stop(),
          this.preventionModule?.stop(),
          this.triggerModule?.stop(),
        ].filter(Boolean)
      );

      logger.info("Watcher Service stopped successfully");
      this.isRunning = false;
    } catch (error) {
      logger.error("Error stopping Watcher Service:", error);
      throw error;
    }
  }

  /**
   * Set up communication between modules
   */
  private setupModuleCommunication(): void {
    if (!this.detectionModule) {
      return;
    }

    // Set up event forwarding from detection to prevention and trigger
    this.detectionModule.eventBus.on("fileDetected", async (event) => {
      const startTime = Date.now();
      try {
        this.metrics.filesProcessed++;
        this.metrics.lastFileTime = new Date();

        // Process file through prevention module (if available)
        let preventionResult: any = { success: true, errors: [], warnings: [] };
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
      }
    });

    this.detectionModule.eventBus.on("fileModified", async (event) => {
      const startTime = Date.now();
      try {
        this.metrics.filesProcessed++;
        this.metrics.lastFileTime = new Date();

        // Process file through prevention module (if available)
        let preventionResult: any = { success: true, errors: [], warnings: [] };
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

        this.metrics.filesCorrected++;
        this.metrics.totalProcessingTime += Date.now() - startTime;
      } catch (error) {
        this.metrics.filesFailed++;
        logger.error("Error in file modification handling:", error);
      }
    });

    this.detectionModule.eventBus.on("fileDeleted", async (event) => {
      try {
        // Notify trigger module about the deleted file (if available)
        if (this.triggerModule) {
          await this.triggerModule.processEvent({
            filePath: event.file.filePath,
            eventType: "fileDeleted",
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error("Error in file deletion handling:", error);
      }
    });

    logger.info("Module communication setup completed");
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    running: boolean;
    metrics: ServiceMetrics;
    modules: {
      detection?: any;
      prevention?: any;
      trigger?: any;
    };
  } {
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

      logger.info("Configuration reloaded successfully");
    } catch (error) {
      logger.error("Error reloading configuration:", error);
      throw error;
    }
  }
}

/**
 * CLI interface for the Watcher Service
 */
export class WatcherCLI {
  private service: WatcherService;
  private program: Command;

  constructor() {
    this.service = new WatcherService();
    this.program = new Command();

    this.setupCLI();
  }

  private setupCLI(): void {
    this.program
      .name("watcher")
      .description(
        chalk.blue("File watcher service") +
          " for surveillance, prevention, and automatic correction"
      )
      .version("1.0.0");

    this.setupStartCommand();
    this.setupStopCommand();
    this.setupStatusCommand();
    this.setupReloadCommand();
    this.setupTestCommand();
    this.setupConfigCommand();
    this.setupTestAllCommand();
  }

  private setupStartCommand(): void {
    this.program
      .command("start")
      .description("Start the watcher service")
      .option(
        "-d, --dir <directory>",
        "Directory to watch",
        process.env.WATCH_DIR || process.cwd()
      )
      .option("--no-prevention", "Disable prevention module")
      .option("--no-trigger", "Disable trigger module")
      .action(async (options) => {
        try {
          console.log(chalk.blue("▶") + " Starting Watcher Service...");

          this.service = new WatcherService({
            watchDir: options.dir,
            enablePrevention: options.prevention,
            enableTrigger: options.trigger,
          });

          await this.service.initialize();
          await this.service.start();

          console.log(
            chalk.green("✔") +
              " Watcher Service " +
              chalk.bold("started") +
              " on " +
              chalk.cyan(options.dir)
          );
          console.log(
            chalk.gray(
              "  Prevention: " +
                (options.prevention ? chalk.green("ON") : chalk.red("OFF"))
            )
          );
          console.log(
            chalk.gray(
              "  Trigger:    " +
                (options.trigger ? chalk.green("ON") : chalk.red("OFF"))
            )
          );
          console.log(chalk.gray("  Press Ctrl+C to stop."));

          process.on("SIGINT", async () => {
            console.log(chalk.yellow("\n⏹") + " Stopping service...");
            await this.service.stop();
            this.printMetrics();
            process.exit(0);
          });

          process.on("SIGTERM", async () => {
            await this.service.stop();
            process.exit(0);
          });
        } catch (error) {
          console.error(chalk.red("✖") + " Error starting service:", error);
          process.exit(1);
        }
      });
  }

  private setupStopCommand(): void {
    this.program
      .command("stop")
      .description("Stop the watcher service")
      .action(async () => {
        try {
          await this.service.stop();
          console.log(chalk.green("✔") + " Watcher Service stopped");
        } catch (error) {
          console.error(chalk.red("✖") + " Error stopping service:", error);
          process.exit(1);
        }
      });
  }

  private setupStatusCommand(): void {
    this.program
      .command("status")
      .description("Show watcher service status")
      .option("--json", "Output as JSON")
      .action((options) => {
        const status = this.service.getStatus();

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        console.log(chalk.bold("\nWatcher Service Status\n"));
        console.log(
          "  " +
            chalk.gray("Initialized:") +
            " " +
            (status.initialized ? chalk.green("✔ Yes") : chalk.red("✖ No"))
        );
        console.log(
          "  " +
            chalk.gray("Running:") +
            " " +
            (status.running ? chalk.green("✔ Yes") : chalk.red("✖ No"))
        );

        if (status.metrics.startTime) {
          console.log(
            "  " +
              chalk.gray("Started at:") +
              " " +
              chalk.cyan(status.metrics.startTime.toISOString())
          );
        }

        console.log(chalk.bold("\n  Metrics\n"));
        console.log(
          "  " +
            chalk.gray("Files processed:") +
            " " +
            chalk.cyan(String(status.metrics.filesProcessed))
        );
        console.log(
          "  " +
            chalk.gray("Files corrected:") +
            " " +
            chalk.green(String(status.metrics.filesCorrected))
        );
        console.log(
          "  " +
            chalk.gray("Files failed:") +
            " " +
            chalk.red(String(status.metrics.filesFailed))
        );
        if (status.metrics.totalProcessingTime > 0) {
          const avg =
            status.metrics.filesProcessed > 0
              ? Math.round(
                  status.metrics.totalProcessingTime /
                    status.metrics.filesProcessed
                )
              : 0;
          console.log(
            "  " +
              chalk.gray("Avg processing time:") +
              " " +
              chalk.cyan(`${avg}ms`)
          );
        }

        console.log(chalk.bold("\n  Modules\n"));
        for (const [name, modStatus] of Object.entries(status.modules)) {
          const state =
            modStatus && typeof modStatus === "object" && "running" in modStatus
              ? (modStatus as any).running
              : false;
          console.log(
            "  " +
              chalk.gray(`${name}:`) +
              " " +
              (state ? chalk.green("✔ Running") : chalk.red("✖ Stopped"))
          );
        }
        console.log();
      });
  }

  private setupReloadCommand(): void {
    this.program
      .command("reload")
      .description("Reload configuration")
      .action(async () => {
        try {
          await this.service.reloadConfig();
          console.log(chalk.green("✔") + " Configuration reloaded");
        } catch (error) {
          console.error(
            chalk.red("✖") + " Error reloading configuration:",
            error
          );
          process.exit(1);
        }
      });
  }

  private setupTestCommand(): void {
    this.program
      .command("test")
      .description("Test the watcher service with a sample file")
      .option("-f, --file <file>", "File to test with")
      .action(async (options) => {
        try {
          if (!options.file) {
            console.error(
              chalk.red("✖") +
                " Please specify a file to test with: " +
                chalk.bold("--file <file>")
            );
            process.exit(1);
          }

          if (!fs.existsSync(options.file)) {
            console.error(
              chalk.red("✖") + " File not found: " + chalk.bold(options.file)
            );
            process.exit(1);
          }

          await this.service.initialize();

          console.log(
            chalk.blue("▶") + " Testing with file: " + chalk.cyan(options.file)
          );

          const startTime = Date.now();
          const testResult = await (
            this.service as any
          ).preventionModule?.processFile(options.file);
          const duration = Date.now() - startTime;

          if (!testResult) {
            console.log(chalk.yellow("⚠") + " Prevention module not available");
            return;
          }

          console.log(chalk.gray(`  Completed in ${duration}ms\n`));

          if (testResult.success) {
            console.log(chalk.green("✔") + " Validation passed");
          } else {
            console.log(chalk.red("✖") + " Validation failed");
          }

          if (testResult.errors && testResult.errors.length > 0) {
            console.log(chalk.red("\n  Errors:"));
            for (const err of testResult.errors) {
              console.log("    " + chalk.red("•") + " " + err);
            }
          }

          if (testResult.warnings && testResult.warnings.length > 0) {
            console.log(chalk.yellow("\n  Warnings:"));
            for (const warn of testResult.warnings) {
              console.log("    " + chalk.yellow("•") + " " + warn);
            }
          }

          if (testResult.metadata) {
            console.log(
              chalk.gray("\n  Metadata:") +
                " " +
                JSON.stringify(testResult.metadata, null, 2)
            );
          }
          console.log();
        } catch (error) {
          console.error(chalk.red("✖") + " Error in test:", error);
          process.exit(1);
        }
      });
  }

  private setupConfigCommand(): void {
    this.program
      .command("config")
      .description("Validate and display current configuration")
      .option("--validate", "Validate config files only")
      .option("--prevention <path>", "Path to prevention config file")
      .option("--trigger <path>", "Path to trigger config file")
      .action(async (options) => {
        try {
          const preventionPath =
            options.prevention ||
            path.join(process.cwd(), "config", "prevention-rules.json");
          const triggerPath =
            options.trigger ||
            path.join(process.cwd(), "config", "trigger-rules.json");

          console.log(chalk.bold("\nConfiguration Validation\n"));

          let hasErrors = false;

          // Validate prevention config
          console.log(
            chalk.gray("Prevention config: ") + chalk.cyan(preventionPath)
          );
          if (fs.existsSync(preventionPath)) {
            const preventionConfig = fs.readJsonSync(preventionPath);
            const result = validateConfig(
              preventionConfig,
              preventionConfigSchema
            );
            if (result.valid) {
              console.log(
                "  " +
                  chalk.green("✔") +
                  " Valid" +
                  (result.warnings.length > 0
                    ? chalk.yellow(` (${result.warnings.length} warnings)`)
                    : "")
              );
              if (!options.validate) {
                console.log(
                  "    " +
                    chalk.gray("Rules: ") +
                    chalk.cyan(String(preventionConfig.rules?.length || 0))
                );
                const enabled =
                  preventionConfig.rules?.filter((r: any) => r.enabled)
                    .length || 0;
                console.log(
                  "    " +
                    chalk.gray("Enabled: ") +
                    chalk.green(String(enabled))
                );
              }
            } else {
              hasErrors = true;
              console.log("  " + chalk.red("✖ Invalid"));
              for (const err of result.errors) {
                console.log("    " + chalk.red("•") + " " + err);
              }
            }
          } else {
            console.log("  " + chalk.yellow("⚠ File not found"));
          }

          // Validate trigger config
          console.log(
            chalk.gray("\nTrigger config:    ") + chalk.cyan(triggerPath)
          );
          if (fs.existsSync(triggerPath)) {
            const triggerConfig = fs.readJsonSync(triggerPath);
            const result = validateConfig(triggerConfig, triggerConfigSchema);
            if (result.valid) {
              console.log(
                "  " +
                  chalk.green("✔") +
                  " Valid" +
                  (result.warnings.length > 0
                    ? chalk.yellow(` (${result.warnings.length} warnings)`)
                    : "")
              );
              if (!options.validate) {
                console.log(
                  "    " +
                    chalk.gray("Rules: ") +
                    chalk.cyan(String(triggerConfig.rules?.length || 0))
                );
                const enabled =
                  triggerConfig.rules?.filter((r: any) => r.enabled).length ||
                  0;
                console.log(
                  "    " +
                    chalk.gray("Enabled: ") +
                    chalk.green(String(enabled))
                );
              }
            } else {
              hasErrors = true;
              console.log("  " + chalk.red("✖ Invalid"));
              for (const err of result.errors) {
                console.log("    " + chalk.red("•") + " " + err);
              }
            }
          } else {
            console.log("  " + chalk.yellow("⚠ File not found"));
          }

          console.log();
          if (hasErrors) {
            process.exit(1);
          }
        } catch (error) {
          console.error(chalk.red("✖") + " Error validating config:", error);
          process.exit(1);
        }
      });
  }

  private setupTestAllCommand(): void {
    this.program
      .command("test-all")
      .description("Test the full pipeline with a sample file")
      .option("-d, --dir <directory>", "Directory to watch", process.cwd())
      .option("-f, --file <file>", "Specific file to test")
      .action(async (options) => {
        try {
          console.log(chalk.bold("\nFull Pipeline Test\n"));

          // Create a temp test file if no file specified
          let testFile = options.file;
          let cleanupNeeded = false;

          if (!testFile) {
            const tmpDir = path.join(
              process.env.TEMP || process.env.TMP || "/tmp",
              "watcher-test"
            );
            await fs.ensureDir(tmpDir);
            testFile = path.join(tmpDir, "test-pipeline.ts");
            await fs.writeFile(
              testFile,
              'const x: string = "hello";\nconsole.log(x);\n'
            );
            cleanupNeeded = true;
            console.log(
              chalk.gray("  Created test file: ") + chalk.cyan(testFile)
            );
          } else if (!fs.existsSync(testFile)) {
            console.error(
              chalk.red("✖") + " File not found: " + chalk.bold(testFile)
            );
            process.exit(1);
          }

          // Step 1: Initialize service
          console.log(
            chalk.blue("\n1.") + chalk.bold(" Initializing modules...")
          );
          this.service = new WatcherService({
            watchDir: options.dir,
          });
          const initStart = Date.now();
          await this.service.initialize();
          console.log(chalk.gray(`   Done in ${Date.now() - initStart}ms`));

          // Step 2: Prevention check
          console.log(
            chalk.blue("\n2.") + chalk.bold(" Running prevention checks...")
          );
          const prevStart = Date.now();
          const preventionResult = await (
            this.service as any
          ).preventionModule?.processFile(testFile);
          const prevDuration = Date.now() - prevStart;

          if (preventionResult) {
            if (preventionResult.success) {
              console.log(
                "   " +
                  chalk.green("✔") +
                  " Passed" +
                  chalk.gray(` (${prevDuration}ms)`)
              );
            } else {
              console.log(
                "   " +
                  chalk.red("✖") +
                  " Failed" +
                  chalk.gray(` (${prevDuration}ms)`)
              );
              if (preventionResult.errors?.length > 0) {
                for (const err of preventionResult.errors) {
                  console.log("     " + chalk.red("•") + " " + err);
                }
              }
            }
            if (preventionResult.warnings?.length > 0) {
              for (const warn of preventionResult.warnings) {
                console.log("     " + chalk.yellow("•") + " " + warn);
              }
            }
          } else {
            console.log(
              "   " + chalk.yellow("⚠ Skipped (module not available)")
            );
          }

          // Step 3: Trigger processing
          console.log(
            chalk.blue("\n3.") + chalk.bold(" Running trigger processing...")
          );
          const trigStart = Date.now();
          const triggerResult = await (
            this.service as any
          ).triggerModule?.processEvent({
            filePath: testFile,
            eventType: "fileDetected",
            metadata: { preventionResult },
            timestamp: new Date(),
          });
          const trigDuration = Date.now() - trigStart;

          if (triggerResult) {
            if (triggerResult.success) {
              console.log(
                "   " +
                  chalk.green("✔") +
                  " Completed" +
                  chalk.gray(` (${trigDuration}ms)`)
              );
            } else {
              console.log(
                "   " +
                  chalk.red("✖") +
                  " Failed" +
                  chalk.gray(` (${trigDuration}ms)`)
              );
            }
            if (triggerResult.actions?.length > 0) {
              for (const action of triggerResult.actions) {
                const icon = action.success ? chalk.green("✔") : chalk.red("✖");
                console.log("     " + icon + " " + action.type);
              }
            }
          } else {
            console.log(
              "   " + chalk.yellow("⚠ Skipped (module not available)")
            );
          }

          // Summary
          console.log(chalk.bold("\nSummary\n"));
          console.log(
            "  " +
              chalk.gray("Total time: ") +
              chalk.cyan(`${Date.now() - prevStart}ms`)
          );
          console.log("  " + chalk.gray("File: ") + chalk.cyan(testFile));
          console.log();

          // Cleanup
          if (cleanupNeeded) {
            await fs.remove(path.dirname(testFile));
          }
        } catch (error) {
          console.error(chalk.red("✖") + " Error in pipeline test:", error);
          process.exit(1);
        }
      });
  }

  private printMetrics(): void {
    const metrics = this.service.getMetrics();
    if (metrics.filesProcessed > 0) {
      console.log(chalk.bold("\nSession Metrics\n"));
      console.log(
        "  " +
          chalk.gray("Files processed:") +
          " " +
          chalk.cyan(String(metrics.filesProcessed))
      );
      console.log(
        "  " +
          chalk.gray("Files corrected:") +
          " " +
          chalk.green(String(metrics.filesCorrected))
      );
      console.log(
        "  " +
          chalk.gray("Files failed:") +
          " " +
          chalk.red(String(metrics.filesFailed))
      );
      if (metrics.totalProcessingTime > 0) {
        const avg = Math.round(
          metrics.totalProcessingTime / metrics.filesProcessed
        );
        console.log(
          "  " +
            chalk.gray("Avg processing time:") +
            " " +
            chalk.cyan(`${avg}ms`)
        );
      }
      console.log();
    }
  }

  /**
   * Parse and execute CLI commands
   */
  async run(): Promise<void> {
    try {
      await this.program.parseAsync(process.argv);
    } catch (error) {
      logger.error("CLI error:", error);
      process.exit(1);
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
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
