import {
  CircuitBreaker,
  CircuitState,
  retryWithBackoff,
} from "../../src/shared/circuit-breaker";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker(3, 1000);
  });

  test("starts in CLOSED state", () => {
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  test("executes function successfully", async () => {
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  test("opens after threshold failures", async () => {
    const failingFn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await cb.execute(failingFn).catch(() => {});
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  test("rejects calls when OPEN", async () => {
    const failingFn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await cb.execute(failingFn).catch(() => {});
    }

    await expect(cb.execute(async () => 1)).rejects.toThrow(
      "Circuit breaker is OPEN"
    );
  });

  test("moves to HALF_OPEN after timeout", async () => {
    const shortCb = new CircuitBreaker(2, 50);
    const failingFn = async () => {
      throw new Error("fail");
    };

    await shortCb.execute(failingFn).catch(() => {});
    await shortCb.execute(failingFn).catch(() => {});
    expect(shortCb.getState()).toBe(CircuitState.OPEN);

    await new Promise((r) => setTimeout(r, 60));
    expect(shortCb.getState()).toBe(CircuitState.HALF_OPEN);
  });

  test("closes when HALF_OPEN call succeeds", async () => {
    const shortCb = new CircuitBreaker(2, 50);
    const failingFn = async () => {
      throw new Error("fail");
    };

    await shortCb.execute(failingFn).catch(() => {});
    await shortCb.execute(failingFn).catch(() => {});
    await new Promise((r) => setTimeout(r, 60));

    await shortCb.execute(async () => "ok");
    expect(shortCb.getState()).toBe(CircuitState.CLOSED);
  });

  test("reset restores to CLOSED", async () => {
    const failingFn = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await cb.execute(failingFn).catch(() => {});
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  test("getStats returns correct data", () => {
    const stats = cb.getStats();
    expect(stats.state).toBe(CircuitState.CLOSED);
    expect(stats.failureCount).toBe(0);
  });
});

describe("retryWithBackoff", () => {
  test("succeeds on first attempt", async () => {
    const result = await retryWithBackoff(async () => 42, 3, 10);
    expect(result).toBe(42);
  });

  test("retries and eventually succeeds", async () => {
    let attempts = 0;
    const result = await retryWithBackoff(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("not yet");
        return "done";
      },
      3,
      10
    );
    expect(result).toBe("done");
    expect(attempts).toBe(3);
  });

  test("throws after max attempts", async () => {
    await expect(
      retryWithBackoff(
        async () => {
          throw new Error("always fail");
        },
        2,
        10
      )
    ).rejects.toThrow("always fail");
  });
});
