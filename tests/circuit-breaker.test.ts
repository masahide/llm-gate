import { describe, expect, test, vi } from "vitest";
import { SevenDtdCircuitBreaker } from "../src/seven-dtd/circuit-breaker.js";

describe("SevenDtdCircuitBreaker", () => {
  test("transitions closed -> open -> half_open -> closed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T00:00:00Z"));
    const breaker = new SevenDtdCircuitBreaker({ failureThreshold: 2, openMs: 1000 });

    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");

    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    expect(breaker.isOpen()).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getState()).toBe("half_open");
    expect(breaker.canProbe()).toBe(true);
    expect(breaker.canProbe()).toBe(false);

    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
    vi.useRealTimers();
  });

  test("returns to open when half-open probe fails", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T00:00:00Z"));
    const breaker = new SevenDtdCircuitBreaker({ failureThreshold: 1, openMs: 1000 });
    breaker.recordFailure();
    vi.advanceTimersByTime(1001);
    expect(breaker.canProbe()).toBe(true);
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    vi.useRealTimers();
  });
});
