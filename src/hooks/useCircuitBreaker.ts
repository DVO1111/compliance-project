import { useRef, useCallback } from "react";
import { logger } from '../lib/logger';

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  failureThreshold?: number;   // failures before opening (default: 3)
  recoveryTimeout?: number;    // ms before trying again (default: 30000)
  onStateChange?: (state: CircuitState) => void;
}

export function useCircuitBreaker(options: CircuitBreakerOptions = {}) {
  const {
    failureThreshold = 3,
    recoveryTimeout = 30_000,
    onStateChange,
  } = options;

  const state = useRef<CircuitState>("CLOSED");
  const failures = useRef(0);
  const lastFailureTime = useRef<number | null>(null);

  const setState = (next: CircuitState) => {
    state.current = next;
    onStateChange?.(next);
  };

  const execute = useCallback(
    async <T>(
      apiFn: () => Promise<T>,
      fallbackFn: () => T | Promise<T>
    ): Promise<T> => {
      // OPEN: check if recovery window has passed
      if (state.current === "OPEN") {
        const elapsed = Date.now() - (lastFailureTime.current ?? 0);
        if (elapsed >= recoveryTimeout) {
          setState("HALF_OPEN");
        } else {
          logger.warn("[CircuitBreaker] OPEN — using fallback");
          return fallbackFn();
        }
      }

      try {
        const result = await apiFn();
        // Success — reset
        failures.current = 0;
        if (state.current === "HALF_OPEN") setState("CLOSED");
        return result;
      } catch (err) {
        failures.current += 1;
        lastFailureTime.current = Date.now();

        if (failures.current >= failureThreshold) {
          setState("OPEN");
          logger.error(`[CircuitBreaker] OPEN after ${failures.current} failures`);
        }

        return fallbackFn();
      }
    },
    [failureThreshold, recoveryTimeout]
  );

  return {
    execute,
    getState: () => state.current,
    reset: () => {
      failures.current = 0;
      setState("CLOSED");
    },
  };
}
