import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("processor");
/**
 * One sequential processing chain.
 * Processes files one at a time: validate → correct → re-validate → next.
 */
export class ProcessingChain {
    queue = [];
    processing = false;
    preventionModule;
    triggerModule;
    chainId;
    onComplete;
    constructor(chainId, preventionModule, triggerModule, onComplete) {
        this.chainId = chainId;
        this.preventionModule = preventionModule;
        this.triggerModule = triggerModule;
        this.onComplete = onComplete || null;
    }
    /**
     * Add a file to this chain's queue
     */
    enqueue(filePath) {
        this.queue.push(filePath);
        if (!this.processing) {
            this.run();
        }
    }
    /**
     * Process files one by one until queue is empty
     */
    async run() {
        this.processing = true;
        while (this.queue.length > 0) {
            const filePath = this.queue.shift();
            const startTime = Date.now();
            try {
                logger.debug(`Chain ${this.chainId}: ${filePath} (${this.queue.length} remaining)`);
                // Step 1: Validate
                const preventionResult = await this.preventionModule.processFile(filePath);
                // Step 2: Correct if needed
                if (this.triggerModule &&
                    (!preventionResult.success || preventionResult.warnings.length > 0)) {
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
                }
                else {
                    logger.warn(`Chain ${this.chainId}: FAIL ${filePath}`);
                }
            }
            catch (error) {
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
            await new Promise((r) => setImmediate(r));
        }
        this.processing = false;
    }
    getQueueLength() {
        return this.queue.length;
    }
    isProcessing() {
        return this.processing;
    }
    getTotal() {
        return this.queue.length + (this.processing ? 1 : 0);
    }
}
//# sourceMappingURL=processing-chain.js.map