export declare enum CircuitState {
    CLOSED = "closed",// Normal operation
    OPEN = "open",// Failing, reject calls
    HALF_OPEN = "half-open"
}
export type CircuitBreakerStateListener = (state: CircuitState, stats: {
    failureCount: number;
    lastFailureTime: number;
}) => void;
/**
 * Circuit Breaker pattern to prevent repeated failures from a broken dependency.
 * After N consecutive failures, the circuit opens and rejects calls for a timeout period.
 */
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private lastFailureTime;
    private readonly threshold;
    private readonly timeout;
    private stateListeners;
    /**
     * @param threshold Number of consecutive failures before opening the circuit
     * @param timeoutMs Time in ms to keep the circuit open before trying again
     */
    constructor(threshold?: number, timeout?: number);
    /**
     * Subscribe to state changes (for alerting/monitoring)
     */
    onStateChange(listener: CircuitBreakerStateListener): void;
    getState(): CircuitState;
    /**
     * Execute a function through the circuit breaker.
     * Throws if the circuit is OPEN.
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    private notifyListeners;
    private onSuccess;
    private onFailure;
    reset(): void;
    getStats(): {
        state: CircuitState;
        failureCount: number;
        lastFailureTime: number;
    };
}
/**
 * Retry a function with exponential backoff.
 * @param fn Function to retry
 * @param maxAttempts Max number of attempts (including the first call)
 * @param baseDelayMs Base delay in ms (doubles each retry)
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts?: number, baseDelayMs?: number): Promise<T>;
//# sourceMappingURL=circuit-breaker.d.ts.map