import { createChildLogger } from "./logger.js";
const logger = createChildLogger("circuit-breaker");
export var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "closed";
    CircuitState["OPEN"] = "open";
    CircuitState["HALF_OPEN"] = "half-open";
})(CircuitState || (CircuitState = {}));
/**
 * Circuit Breaker pattern to prevent repeated failures from a broken dependency.
 * After N consecutive failures, the circuit opens and rejects calls for a timeout period.
 */
export class CircuitBreaker {
    state = CircuitState.CLOSED;
    failureCount = 0;
    lastFailureTime = 0;
    threshold;
    timeout;
    stateListeners = [];
    /**
     * @param threshold Number of consecutive failures before opening the circuit
     * @param timeoutMs Time in ms to keep the circuit open before trying again
     */
    constructor(threshold = 5, timeout = 60000) {
        this.threshold = threshold;
        this.timeout = timeout;
    }
    /**
     * Subscribe to state changes (for alerting/monitoring)
     */
    onStateChange(listener) {
        this.stateListeners.push(listener);
    }
    getState() {
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
    async execute(fn) {
        const currentState = this.getState();
        if (currentState === CircuitState.OPEN) {
            throw new Error(`Circuit breaker is OPEN. Retry after ${this.timeout - (Date.now() - this.lastFailureTime)}ms`);
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    notifyListeners() {
        const stats = {
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
        };
        for (const listener of this.stateListeners) {
            try {
                listener(this.state, stats);
            }
            catch {
                // listener errors are ignored
            }
        }
    }
    onSuccess() {
        this.failureCount = 0;
        if (this.state !== CircuitState.CLOSED) {
            logger.info("Circuit breaker closed (recovered)");
            this.state = CircuitState.CLOSED;
            this.notifyListeners();
        }
    }
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.threshold) {
            this.state = CircuitState.OPEN;
            logger.warn(`Circuit breaker OPEN after ${this.failureCount} consecutive failures`);
            this.notifyListeners();
        }
    }
    reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
    }
    getStats() {
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
export async function retryWithBackoff(fn, maxAttempts = 3, baseDelayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxAttempts) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1);
                logger.debug(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
//# sourceMappingURL=circuit-breaker.js.map