import { PreventionModule, PreventionResult } from "../prevention/index.js";
import { TriggerModule } from "../trigger/index.js";
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
export declare class ProcessingChain {
    private queue;
    private processing;
    private readonly preventionModule;
    private readonly triggerModule;
    readonly chainId: number;
    private readonly onComplete;
    constructor(chainId: number, preventionModule: PreventionModule, triggerModule: TriggerModule | null, onComplete?: OnFileComplete);
    /**
     * Add a file to this chain's queue
     */
    enqueue(filePath: string): void;
    /**
     * Process files one by one until queue is empty
     */
    private run;
    getQueueLength(): number;
    isProcessing(): boolean;
    getTotal(): number;
}
//# sourceMappingURL=processing-chain.d.ts.map