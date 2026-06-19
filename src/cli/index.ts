import { Command } from "commander";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import WatcherService from "../index.js";
import { createCorrectorRegistry } from "../trigger/correctors.js";
import {
  preventionConfigSchema,
  triggerConfigSchema,
  validateConfig,
} from "../shared/config-schema.js";
import logger from "../shared/logger.js";
import {
  checkInjectionStatus,
  injectFiles,
  formatCheckResult,
  formatInjectionResults,
} from "../injection/index.js";
import type { AgentType, InjectionResult } from "../injection/types.js";
import {
  analyzeProject,
  formatAnalysis,
  evaluateRules,
  formatEvaluations,
} from "../analysis/index.js";
import {
  generateEnvReport,
  printBanner,
  printCompactBanner,
} from "../environment/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = fs.readJsonSync(path.join(__dirname, "../../package.json"));

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
      .version(pkg.version);

    this.setupStartCommand();
    this.setupStopCommand();
    this.setupStatusCommand();
    this.setupReloadCommand();
    this.setupTestCommand();
    this.setupConfigCommand();
    this.setupTestAllCommand();
    this.setupPreviewCommand();
    this.setupScanCommand();
    this.setupAnalyzeCommand();
    this.setupEnvCommand();
    this.setupDoctorCommand();
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
      .option(
        "--process-existing",
        "Process existing files at startup (emit FILE_ADDED for each)"
      )
      .option(
        "--process-existing-delay <ms>",
        "Delay between each existing file event (default: 10ms)",
        "10"
      )
      .action(async (options) => {
        try {
          console.log(chalk.blue("▶") + " Starting Watcher Service...");

          this.service = new WatcherService({
            watchDir: options.dir,
            enablePrevention: options.prevention,
            enableTrigger: options.trigger,
            processExisting: options.processExisting,
            processExistingDelay: parseInt(options.processExistingDelay),
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
              ? Boolean(modStatus.running)
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
          const testResult = await this.service
            .getPreventionModule()
            ?.processFile(options.file);
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
                  preventionConfig.rules?.filter(
                    (r: Record<string, unknown>) => r.enabled
                  ).length || 0;
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
                  triggerConfig.rules?.filter(
                    (r: Record<string, unknown>) => r.enabled
                  ).length || 0;
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
          const preventionResult = await this.service
            .getPreventionModule()
            ?.processFile(testFile);
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
          const triggerResult = await this.service
            .getTriggerModule()
            ?.processEvent({
              filePath: testFile,
              eventType: "fileDetected",
              metadata: { preventionResult },
              timestamp: new Date(),
            });
          const trigDuration = Date.now() - trigStart;

          if (triggerResult && triggerResult.length > 0) {
            const firstResult = triggerResult[0];
            if (firstResult.success) {
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
            for (const result of triggerResult) {
              for (const action of result.actions) {
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

  /**
   * Scan command — one-shot: detect, fix, inject, then exit
   */
  private setupScanCommand(): void {
    this.program
      .command("scan")
      .description(
        "One-shot scan: detect issues, fix errors, inject consignment files"
      )
      .option("-d, --dir <directory>", "Directory to scan", process.cwd())
      .option("--fix", "Auto-fix detected errors")
      .option("--inject", "Inject missing consignment files")
      .option("--all", "Enable both --fix and --inject")
      .option("--dry-run", "Show what would be done without modifying files")
      .option("--report <file>", "Generate a JSON report to file")
      .option(
        "--agents <agents>",
        "Comma-separated agent types to inject (claude,generic,copilot,cursor,windsurf)"
      )
      .action(async (options) => {
        try {
          const scanDir = path.resolve(options.dir);
          const doFix = options.all || options.fix;
          const doInject = options.all || options.inject;
          const dryRun = options.dryRun;
          const reportPath = options.report;

          const agents: AgentType[] | undefined = options.agents
            ? (options.agents
                .split(",")
                .map((a: string) => a.trim()) as AgentType[])
            : undefined;

          console.log(chalk.bold("\n🔍 Watcher Scan\n"));
          console.log(chalk.gray("  Directory: ") + chalk.cyan(scanDir));
          console.log(
            chalk.gray("  Fix:       ") +
              (doFix ? chalk.green("ON") : chalk.red("OFF"))
          );
          console.log(
            chalk.gray("  Inject:    ") +
              (doInject ? chalk.green("ON") : chalk.red("OFF"))
          );
          if (dryRun) {
            console.log(chalk.gray("  Mode:      ") + chalk.yellow("DRY-RUN"));
          }
          console.log();

          interface ScanReport {
            timestamp: string;
            directory: string;
            options: { doFix: boolean; doInject: boolean; dryRun: boolean };
            analysis: unknown;
            injection: unknown;
            corrections: unknown;
            adaptiveRules: unknown;
            summary: {
              filesScanned: number;
              issuesFound: number;
              fixesApplied: number;
              injected: number;
              rulesTriggered: number;
            };
          }

          const report: ScanReport = {
            timestamp: new Date().toISOString(),
            directory: scanDir,
            options: { doFix, doInject, dryRun },
            analysis: null,
            injection: null,
            corrections: null,
            adaptiveRules: null,
            summary: {
              filesScanned: 0,
              issuesFound: 0,
              fixesApplied: 0,
              injected: 0,
              rulesTriggered: 0,
            },
          };

          // Step 0: Project analysis
          console.log(chalk.blue("0.") + chalk.bold(" Analyzing project..."));
          const analysisStart = Date.now();
          const analysis = await analyzeProject(scanDir);
          const analysisEvals = evaluateRules(analysis);
          const triggeredRules = analysisEvals.filter((e) => e.triggered);

          report.analysis = analysis;
          report.adaptiveRules = triggeredRules;
          report.summary.rulesTriggered = triggeredRules.length;

          console.log(
            chalk.gray(
              `   ${analysis.language}, ${analysis.packageManager}, ${triggeredRules.length} rules triggered`
            )
          );
          console.log(
            chalk.gray(`   Done in ${Date.now() - analysisStart}ms\n`)
          );

          // Step 1: Injection check
          if (doInject || !doFix) {
            console.log(
              chalk.blue("1.") + chalk.bold(" Checking consignment files...")
            );
            const injStart = Date.now();

            const injResult = await checkInjectionStatus({
              projectDir: scanDir,
              agents,
            });

            console.log(formatCheckResult(injResult));
            console.log(chalk.gray(`   Done in ${Date.now() - injStart}ms\n`));

            report.injection = injResult;

            // Step 2: Inject if requested
            if (doInject && injResult.missingCount > 0) {
              console.log(
                chalk.blue("2.") + chalk.bold(" Injecting consignment files...")
              );
              const injectStart = Date.now();

              const injectResult = await injectFiles({
                projectDir: scanDir,
                agents,
                force: false,
                dryRun,
              });

              console.log(formatInjectionResults(injectResult));
              console.log(
                chalk.gray(`   Done in ${Date.now() - injectStart}ms\n`)
              );

              report.corrections = injectResult;
              report.summary.injected = injectResult.filter(
                (r: InjectionResult) =>
                  r.action === "created" || r.action === "updated"
              ).length;
            }
          }

          // Step 3: File scanning + prevention
          if (doFix) {
            console.log(
              chalk.blue(doInject ? "3." : "2.") +
                chalk.bold(" Scanning files for errors...")
            );
            const scanStart = Date.now();

            const service = new WatcherService({ watchDir: scanDir });
            await service.initialize();

            const preventionModule = service.getPreventionModule();
            const triggerModule = service.getTriggerModule();

            // Scan for relevant files
            const extensions = [".ts", ".js", ".json", ".yaml", ".yml"];
            const files = await this.findFiles(scanDir, extensions);

            report.summary.filesScanned = files.length;
            let issuesFound = 0;
            let fixesApplied = 0;

            for (const file of files) {
              try {
                // Prevention check
                if (preventionModule) {
                  const result = await preventionModule.processFile(file);
                  if (result && !result.success) {
                    issuesFound++;
                    if (result.errors) {
                      issuesFound += result.errors.length;
                    }
                  }
                }

                // Trigger (correction) if requested
                if (doFix && triggerModule) {
                  const triggerResult = await triggerModule.processEvent({
                    filePath: file,
                    eventType: "fileDetected",
                    metadata: {},
                    timestamp: new Date(),
                  });

                  if (triggerResult) {
                    for (const tr of triggerResult) {
                      if (tr.success) {
                        fixesApplied++;
                      }
                    }
                  }
                }
              } catch {
                // Skip files that can't be processed
              }
            }

            report.summary.issuesFound = issuesFound;
            report.summary.fixesApplied = fixesApplied;

            console.log(
              chalk.gray(
                `   Scanned ${files.length} files in ${
                  Date.now() - scanStart
                }ms`
              )
            );
            console.log(
              chalk.gray(`   Issues: `) +
                (issuesFound > 0
                  ? chalk.red(String(issuesFound))
                  : chalk.green("0"))
            );
            if (doFix) {
              console.log(
                chalk.gray(`   Fixes:  `) +
                  (fixesApplied > 0
                    ? chalk.green(String(fixesApplied))
                    : chalk.gray("0"))
              );
            }
            console.log();

            await service.stop();
          }

          // Summary
          console.log(chalk.bold("Summary\n"));
          console.log(
            chalk.gray("  Files scanned:    ") +
              chalk.cyan(String(report.summary.filesScanned))
          );
          console.log(
            chalk.gray("  Issues found:     ") +
              (report.summary.issuesFound > 0
                ? chalk.red(String(report.summary.issuesFound))
                : chalk.green("0"))
          );
          if (doFix) {
            console.log(
              chalk.gray("  Fixes applied:    ") +
                chalk.green(String(report.summary.fixesApplied))
            );
          }
          if (doInject) {
            console.log(
              chalk.gray("  Files injected:   ") +
                chalk.green(String(report.summary.injected))
            );
          }
          console.log(
            chalk.gray("  Rules triggered:  ") +
              chalk.yellow(String(report.summary.rulesTriggered))
          );
          console.log();

          // Write report
          if (reportPath) {
            await fs.writeJson(reportPath, report, { spaces: 2 });
            console.log(
              chalk.gray("  Report written: ") + chalk.cyan(reportPath)
            );
            console.log();
          }
        } catch (error) {
          console.error(
            chalk.red("✖") +
              " Scan failed: " +
              (error instanceof Error ? error.message : String(error))
          );
          process.exit(1);
        }
      });
  }

  /**
   * Find files matching given extensions recursively
   */
  private async findFiles(
    dir: string,
    extensions: string[]
  ): Promise<string[]> {
    const results: string[] = [];
    const excludeDirs = ["node_modules", ".git", "dist", "build", ".next"];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name)) {
            const subFiles = await this.findFiles(fullPath, extensions);
            results.push(...subFiles);
          }
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return results;
  }

  /**
   * Analyze command — analyze project structure and evaluate adaptive rules
   */
  private setupAnalyzeCommand(): void {
    this.program
      .command("analyze")
      .description("Analyze project structure and evaluate adaptive rules")
      .option("-d, --dir <directory>", "Directory to analyze", process.cwd())
      .option("--json", "Output as JSON")
      .option("--rules-only", "Show only rule evaluations")
      .action(async (options) => {
        try {
          const projectDir = path.resolve(options.dir);

          // --env is ALWAYS injected automatically for analyze
          let envReport;
          try {
            envReport = await generateEnvReport();
            // Print banner if not already shown (analyze always shows env)
            printBanner(envReport);
          } catch {
            // Continue without env if detection fails
          }

          console.log(chalk.bold("\n📊 Project Analysis\n"));
          console.log(chalk.gray("  Directory: ") + chalk.cyan(projectDir));
          console.log();

          const analysis = await analyzeProject(projectDir);

          if (options.json) {
            console.log(JSON.stringify(analysis, null, 2));
            return;
          }

          if (!options.rulesOnly) {
            console.log(formatAnalysis(analysis));
            console.log();
          }

          // Evaluate adaptive rules
          const evaluations = evaluateRules(analysis);
          const triggered = evaluations.filter((e) => e.triggered);

          console.log(chalk.bold("Adaptive Rules\n"));
          console.log(formatEvaluations(evaluations));
          console.log();

          // Summary
          const enforced = triggered.filter((e) => e.action === "enforce");
          const suggested = triggered.filter((e) => e.action === "suggest");

          console.log(chalk.bold("Summary\n"));
          console.log(
            chalk.gray("  Enforced rules:  ") +
              chalk.yellow(String(enforced.length))
          );
          console.log(
            chalk.gray("  Suggested rules: ") +
              chalk.cyan(String(suggested.length))
          );
          console.log(
            chalk.gray("  Total triggered: ") +
              chalk.green(String(triggered.length))
          );
          console.log();
        } catch (error) {
          console.error(
            chalk.red("✖") +
              " Analysis failed: " +
              (error instanceof Error ? error.message : String(error))
          );
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
   * Environment command — show environment report
   */
  private setupEnvCommand(): void {
    this.program
      .command("env")
      .description("Show environment report (system, tools, dev environment)")
      .option("--json", "Output as JSON")
      .option("--compact", "Show compact banner only")
      .action(async (options) => {
        try {
          const report = await generateEnvReport();

          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }

          if (options.compact) {
            printCompactBanner(report);
            return;
          }

          // Full banner is already shown by run() before this command
          // Just print the detailed info if not already shown
          printBanner(report);
        } catch (error) {
          console.error(
            chalk.red("✖") +
              " Environment detection failed: " +
              (error instanceof Error ? error.message : String(error))
          );
          process.exit(1);
        }
      });
  }

  /**
   * Doctor command — check environment and fix issues
   */
  private setupDoctorCommand(): void {
    this.program
      .command("doctor")
      .description("Check environment health and fix missing tools")
      .option("--fix", "Automatically install missing tools")
      .action(async (options) => {
        try {
          const report = await generateEnvReport();
          printBanner(report);

          if (report.missingTools.length === 0) {
            console.log(chalk.green("✔") + " All tools are available!");
            console.log();
            return;
          }

          console.log(chalk.bold("Missing Tools:\n"));
          for (const tool of report.missingTools) {
            console.log(
              `  ${chalk.red("✗")} ${chalk.bold(tool.name)}: ${
                tool.installSuggestion
              }`
            );
          }
          console.log();

          if (options.fix) {
            console.log(chalk.bold("Installing missing tools...\n"));
            const { execFile } = await import("child_process");
            for (const tool of report.missingTools) {
              if (tool.installSuggestion.startsWith("npm install")) {
                const cmd = tool.installSuggestion;
                console.log(`  ${chalk.yellow("*")} Running: ${cmd}`);
                await new Promise<void>((resolve) => {
                  execFile(
                    "npm",
                    cmd.replace("npm install ", "").split(" "),
                    { timeout: 60000 },
                    (error) => {
                      if (error) {
                        console.log(
                          `    ${chalk.red("✖")} Failed: ${error.message}`
                        );
                      } else {
                        console.log(
                          `    ${chalk.green("✔")} ${tool.name} installed`
                        );
                      }
                      resolve();
                    }
                  );
                });
              } else {
                console.log(
                  `  ${chalk.yellow("!")} Manual install required: ${
                    tool.installSuggestion
                  }`
                );
              }
            }
            console.log(chalk.green("\n✔") + " Doctor scan complete!");
          } else {
            console.log(
              chalk.gray("  Run with ") +
                chalk.cyan("--fix") +
                chalk.gray(" to automatically install missing tools.")
            );
          }
          console.log();
        } catch (error) {
          console.error(
            chalk.red("✖") +
              " Doctor failed: " +
              (error instanceof Error ? error.message : String(error))
          );
          process.exit(1);
        }
      });
  }

  /**
   * Preview/dry-run command — show what corrections would be applied without writing
   */
  private setupPreviewCommand(): void {
    this.program
      .command("preview")
      .description("Preview corrections without writing changes (dry-run)")
      .argument("<files...>", "Files to preview corrections for")
      .action(async (files: string[]) => {
        try {
          const registry = createCorrectorRegistry();
          let totalCorrections = 0;
          let totalErrors = 0;

          for (const filePath of files) {
            const resolved = path.resolve(filePath);
            if (!(await fs.pathExists(resolved))) {
              console.log(
                chalk.red("✖") + " File not found: " + chalk.bold(resolved)
              );
              totalErrors++;
              continue;
            }

            const results = await registry.applyCorrections(
              resolved,
              undefined,
              true
            );
            const corrected = results.filter((r) => r.corrected);

            if (corrected.length === 0) {
              console.log(
                chalk.green("✔") + " " + chalk.gray(resolved) + " — no changes"
              );
              continue;
            }

            console.log(chalk.bold("\n" + resolved));
            for (const result of corrected) {
              if (result.originalContent && result.correctedContent) {
                const oldLines = result.originalContent.split("\n");
                const newLines = result.correctedContent.split("\n");
                const maxLen = Math.max(oldLines.length, newLines.length);
                for (let i = 0; i < maxLen; i++) {
                  const oldLine = oldLines[i];
                  const newLine = newLines[i];
                  if (oldLine !== newLine) {
                    if (oldLine !== undefined) {
                      console.log(chalk.red(`  - ${i + 1}: ${oldLine}`));
                    }
                    if (newLine !== undefined) {
                      console.log(chalk.green(`  + ${i + 1}: ${newLine}`));
                    }
                  }
                }
              }
              totalCorrections++;
            }
          }

          console.log(
            chalk.bold(
              `\n${totalCorrections} correction(s) would be applied to ${
                files.length - totalErrors
              } file(s)`
            )
          );
        } catch (error) {
          console.error(
            chalk.red("✖") +
              " Preview failed: " +
              (error instanceof Error ? error.message : String(error))
          );
          process.exit(1);
        }
      });
  }

  /**
   * Parse and execute CLI commands
   */
  async run(): Promise<void> {
    try {
      // Show banner before every command (except env --compact to avoid double)
      const args = process.argv.slice(2);
      const command = args[0];
      const isCompactEnv = command === "env" && args.includes("--compact");

      if (command && command !== "env") {
        try {
          const report = await generateEnvReport();
          printBanner(report);
        } catch {
          // If environment detection fails, continue with the command
        }
      } else if (command === "env" && !isCompactEnv) {
        // For `env` command without --compact, show full banner
        try {
          const report = await generateEnvReport();
          printBanner(report);
        } catch {
          // Continue
        }
      }

      await this.program.parseAsync(process.argv);
    } catch (error) {
      logger.error("CLI error:", error);
      process.exit(1);
    }
  }
}
