import { OnFileComplete } from "./processing-chain.js";
import { PreventionModule } from "../prevention/index.js";
import { TriggerModule } from "../trigger/index.js";
/**
 * ChainOrchestrator manages N sequential processing chains.
 * Distributes incoming files to the least busy chain.
 */
export declare class ChainOrchestrator {
    private chains;
    private readonly chainCount;
    constructor(preventionModule: PreventionModule, triggerModule: TriggerModule | null, chainCount?: number, onComplete?: OnFileComplete);
    /**
     * Enqueue a file — assigns to the chain with the smallest queue
     */
    enqueue(filePath: string): void;
    getTotalQueued(): number;
    getBusyChains(): number;
    getChainStatus(): Array<{
        chainId: number;
        queued: number;
        processing: boolean;
        total: number;
    }>;
    stop(): void;
}
//# sourceMappingURL=chain-orchestrator.d.ts.map