import { ProcessingChain } from "./processing-chain.js";
import { createChildLogger } from "../shared/logger.js";
const logger = createChildLogger("processor");
/**
 * ChainOrchestrator manages N sequential processing chains.
 * Distributes incoming files to the least busy chain.
 */
export class ChainOrchestrator {
    chains = [];
    chainCount;
    constructor(preventionModule, triggerModule, chainCount = 5, onComplete) {
        this.chainCount = chainCount;
        // Wrap onComplete to handle tool errors: if a tool is missing, ensure
        // the result is marked as failed with a descriptive message.
        const wrappedOnComplete = onComplete
            ? (result) => {
                const hasToolError = result.preventionResult.errors.some((e) => e.rule.startsWith("tool-missing:"));
                if (hasToolError && result.success) {
                    const toolErrors = result.preventionResult.errors.filter((e) => e.rule.startsWith("tool-missing:"));
                    logger.error(`Faux SUCCESS detected for ${result.filePath}: ${toolErrors.length} tool(s) missing`);
                    result.success = false;
                }
                onComplete(result);
            }
            : undefined;
        for (let i = 0; i < chainCount; i++) {
            this.chains.push(new ProcessingChain(i, preventionModule, triggerModule, wrappedOnComplete));
        }
        logger.info(`Orchestrator started: ${chainCount} chains`);
    }
    /**
     * Enqueue a file — assigns to the chain with the smallest queue
     */
    enqueue(filePath) {
        let target = this.chains[0];
        let minQueue = target.getTotal();
        for (let i = 1; i < this.chains.length; i++) {
            const q = this.chains[i].getTotal();
            if (q < minQueue) {
                minQueue = q;
                target = this.chains[i];
            }
        }
        target.enqueue(filePath);
    }
    getTotalQueued() {
        return this.chains.reduce((s, c) => s + c.getQueueLength(), 0);
    }
    getBusyChains() {
        return this.chains.filter((c) => c.isProcessing()).length;
    }
    getChainStatus() {
        return this.chains.map((c) => ({
            chainId: c.chainId,
            queued: c.getQueueLength(),
            processing: c.isProcessing(),
            total: c.getTotal(),
        }));
    }
    stop() {
        logger.info("Orchestrator stopped");
    }
}
//# sourceMappingURL=chain-orchestrator.js.map