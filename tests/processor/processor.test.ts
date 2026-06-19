import { ProcessingChain, ChainResult } from "../../src/processor/processing-chain.js";
import { ChainOrchestrator } from "../../src/processor/chain-orchestrator.js";
import { PreventionModule } from "../../src/prevention/index.js";
import { TriggerModule } from "../../src/trigger/index.js";

/**
 * Minimal mock for PreventionModule — returns success or failure
 */
function createMockPrevention(
  failFiles?: Set<string>
): PreventionModule {
  return {
    processFile: async (filePath: string) => ({
      filePath,
      success: failFiles ? !failFiles.has(filePath) : true,
      errors: failFiles?.has(filePath)
        ? [{ rule: "mock", message: "error", severity: "error" as const }]
        : [],
      warnings: [],
      executionTime: 10,
    }),
  } as unknown as PreventionModule;
}

function createMockTrigger(): TriggerModule {
  return {
    processEvent: async () => {},
  } as unknown as TriggerModule;
}

describe("ProcessingChain", () => {
  it("should process a single file", async () => {
    const processed: string[] = [];
    const chain = new ProcessingChain(
      0,
      createMockPrevention(),
      null,
      (result) => processed.push(result.filePath)
    );

    chain.enqueue("file.ts");

    // Wait for processing
    await new Promise((r) => setTimeout(r, 200));

    expect(processed).toEqual(["file.ts"]);
    expect(chain.getQueueLength()).toBe(0);
    expect(chain.isProcessing()).toBe(false);
  });

  it("should process files sequentially", async () => {
    const processed: string[] = [];
    const chain = new ProcessingChain(
      0,
      createMockPrevention(),
      null,
      (result) => processed.push(result.filePath)
    );

    chain.enqueue("a.ts");
    chain.enqueue("b.ts");
    chain.enqueue("c.ts");

    await new Promise((r) => setTimeout(r, 500));

    expect(processed).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("should report success for valid files", async () => {
    const results: ChainResult[] = [];
    const chain = new ProcessingChain(
      0,
      createMockPrevention(),
      null,
      (r) => results.push(r)
    );

    chain.enqueue("valid.ts");

    await new Promise((r) => setTimeout(r, 200));

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("should report failure for invalid files", async () => {
    const results: ChainResult[] = [];
    const failFiles = new Set(["bad.ts"]);
    const chain = new ProcessingChain(
      0,
      createMockPrevention(failFiles),
      null,
      (r) => results.push(r)
    );

    chain.enqueue("bad.ts");

    await new Promise((r) => setTimeout(r, 200));

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });

  it("should not crash on processing error", async () => {
    const brokenPrevention = {
      processFile: async () => {
        throw new Error("broken");
      },
    } as unknown as PreventionModule;

    const results: ChainResult[] = [];
    const chain = new ProcessingChain(
      0,
      brokenPrevention,
      null,
      (r) => results.push(r)
    );

    chain.enqueue("crash.ts");
    chain.enqueue("after-crash.ts");

    await new Promise((r) => setTimeout(r, 300));

    // First file failed, second file still processed
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(false);
  });
});

describe("ChainOrchestrator", () => {
  it("should distribute files across chains", async () => {
    const processed: string[] = [];
    const orch = new ChainOrchestrator(
      createMockPrevention(),
      null,
      3,
      (r) => processed.push(r.filePath)
    );

    orch.enqueue("a.ts");
    orch.enqueue("b.ts");
    orch.enqueue("c.ts");

    await new Promise((r) => setTimeout(r, 500));

    expect(processed.sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(orch.getTotalQueued()).toBe(0);
  });

  it("should respect chain count", () => {
    const orch = new ChainOrchestrator(
      createMockPrevention(),
      null,
      3
    );

    const status = orch.getChainStatus();
    expect(status).toHaveLength(3);
  });

  it("should track busy chains", async () => {
    // Slow prevention so chain stays busy longer
    const slowPrevention = {
      processFile: async (filePath: string) => {
        await new Promise((r) => setTimeout(r, 100));
        return {
          filePath,
          success: true,
          errors: [],
          warnings: [],
          executionTime: 100,
        };
      },
    } as unknown as PreventionModule;

    const orch = new ChainOrchestrator(slowPrevention, null, 2);

    orch.enqueue("a.ts");
    // Check immediately — chain should be busy
    await new Promise((r) => setTimeout(r, 10));
    expect(orch.getBusyChains()).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 500));
    expect(orch.getBusyChains()).toBe(0);
  });
});
