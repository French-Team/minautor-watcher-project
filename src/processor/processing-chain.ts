import { PreventionModule, PreventionResult } from "../prevention/index.js";
import { TriggerModule } from "../trigger/index.js";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("processor");

/**
 * Result of processing a single file through the chain
 */
export interface ChainResult {
  filePath: string;
  chainId: number;
  preventionResult: PreventionResult;
  success: boolean;
  executionTime: number;
}

/**
 * Callback when a file finishes processing
 */
export type OnFileComplete = (result: ChainResult) => void;

/**
 * One sequential processing chain.
 * Processes files one at a time: validate → correct → re-validate → next.
 */
export class ProcessingChain {
  private queue: string[] = [];
  private processing = false;
  private readonly preventionModule: PreventionModule;
  private readonly triggerModule: TriggerModule | null;
  readonly chainId: number;
  private readonly onComplete: OnFileComplete | null;

  constructor(
    chainId: number,
    preventionModule: PreventionModule,
    triggerModule: TriggerModule | null,
    onComplete?: OnFileComplete
  ) {
    this.chainId = chainId;
    this.preventionModule = preventionModule;
    this.triggerModule = triggerModule;
    this.onComplete = onComplete || null;
  }

  /**
   * Add a file to this chain's queue
   */
  enqueue(filePath: string): void {
    this.queue.push(filePath);
    if (!this.processing) {
      this.run();
    }
  }

  /**
   * Process files one by one until queue is empty
   */
  private async run(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const filePath = this.queue.shift()!;
      const startTime = Date.now();

      try {
        logger.debug(
          `Chain ${this.chainId}: ${filePath} (${this.queue.length} remaining)`
        );

        // Step 1: Validate
        const preventionResult = await this.preventionModule.processFile(
          filePath
        );

        // Step 2: Correct if needed
        if (
          this.triggerModule &&
          (!preventionResult.success || preventionResult.warnings.length > 0)
        ) {
          await this.triggerModule.processEvent({
            filePath,
            eventType: preventionResult.success
              ? "fileDetected"
              : "preventionFailed",
            metadata: { preventionResult },
            timestamp: new Date(),
          });
        }

        // Step 3: Re-validate after corrections
        const finalResult = await this.preventionModule.processFile(filePath);

        const executionTime = Date.now() - startTime;

        // Step 4: Report result
        if (this.onComplete) {
          this.onComplete({
            filePath,
            chainId: this.chainId,
            preventionResult: finalResult,
            success: finalResult.success,
            executionTime,
          });
        }

        if (finalResult.success) {
          logger.debug(`Chain ${this.chainId}: OK ${filePath}`);
        } else {
          logger.warn(`Chain ${this.chainId}: FAIL ${filePath}`);
        }
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`Chain ${this.chainId}: ERROR ${filePath}:`, error);

        if (this.onComplete) {
          this.onComplete({
            filePath,
            chainId: this.chainId,
            preventionResult: {
              filePath,
              success: false,
              errors: [
                { rule: "chain", message: String(error), severity: "error" },
              ],
              warnings: [],
              executionTime,
            },
            success: false,
            executionTime,
          });
        }
      }

      // Yield to event loop between files
      await new Promise<void>((r) => setImmediate(r));
    }

    this.processing = false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  getTotal(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }
}
