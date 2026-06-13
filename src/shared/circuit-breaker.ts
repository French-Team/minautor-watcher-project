import { createChildLogger } from "./logger.js";

const logger = createChildLogger("circuit-breaker");

export enum CircuitState {
  CLOSED = "closed", // Normal operation
  OPEN = "open", // Failing, reject calls
  HALF_OPEN = "half-open", // Testing if recovered
}

export type CircuitBreakerStateListener = (
  state: CircuitState,
  stats: { failureCount: number; lastFailureTime: number }
) => void;

/**
 * Circuit Breaker pattern to prevent repeated failures from a broken dependency.
 * After N consecutive failures, the circuit opens and rejects calls for a timeout period.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly timeout: number;
  private stateListeners: CircuitBreakerStateListener[] = [];

  /**
   * @param threshold Number of consecutive failures before opening the circuit
   * @param timeoutMs Time in ms to keep the circuit open before trying again
   */
  constructor(threshold: number = 5, timeout: number = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
  }

  /**
   * Subscribe to state changes (for alerting/monitoring)
   */
  onStateChange(listener: CircuitBreakerStateListener): void {
    this.stateListeners.push(listener);
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed -> move to HALF_OPEN
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        logger.info("Circuit breaker moved to HALF_OPEN, testing...");
        this.notifyListeners();
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws if the circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      throw new Error(
        `Circuit breaker is OPEN. Retry after ${
          this.timeout - (Date.now() - this.lastFailureTime)
        }ms`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private notifyListeners(): void {
    const stats = {
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
    for (const listener of this.stateListeners) {
      try {
        listener(this.state, stats);
      } catch {
        // listener errors are ignored
      }
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state !== CircuitState.CLOSED) {
      logger.info("Circuit breaker closed (recovered)");
      this.state = CircuitState.CLOSED;
      this.notifyListeners();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      logger.warn(
        `Circuit breaker OPEN after ${this.failureCount} consecutive failures`
      );
      this.notifyListeners();
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  getStats(): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Retry a function with exponential backoff.
 * @param fn Function to retry
 * @param maxAttempts Max number of attempts (including the first call)
 * @param baseDelayMs Base delay in ms (doubles each retry)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.debug(
          `Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
