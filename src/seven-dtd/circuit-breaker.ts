type BreakerState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  failureThreshold: number;
  openMs: number;
};

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_OPEN_MS = 60000;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function readCircuitBreakerConfigFromEnv(): CircuitBreakerConfig {
  return {
    failureThreshold: clampInt(process.env.SEVEN_DTD_CB_FAILURE_THRESHOLD, 1, 20, 5),
    openMs: clampInt(process.env.SEVEN_DTD_CB_OPEN_MS, 1000, 600000, DEFAULT_OPEN_MS),
  };
}

export class SevenDtdCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private failureCount = 0;
  private state: BreakerState = "closed";
  private openUntilMs = 0;
  private halfOpenProbeConsumed = false;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.failureThreshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.openMs = config?.openMs ?? DEFAULT_OPEN_MS;
  }

  private moveToHalfOpen(now: number): void {
    if (this.state === "open" && now >= this.openUntilMs) {
      this.state = "half_open";
      this.halfOpenProbeConsumed = false;
    }
  }

  isOpen(now = Date.now()): boolean {
    this.moveToHalfOpen(now);
    return this.state === "open";
  }

  canProbe(now = Date.now()): boolean {
    this.moveToHalfOpen(now);
    if (this.state !== "half_open") return false;
    if (this.halfOpenProbeConsumed) return false;
    this.halfOpenProbeConsumed = true;
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
    this.openUntilMs = 0;
    this.halfOpenProbeConsumed = false;
  }

  recordFailure(now = Date.now()): void {
    if (this.state === "half_open" || this.state === "open") {
      this.state = "open";
      this.openUntilMs = now + this.openMs;
      this.halfOpenProbeConsumed = false;
      return;
    }

    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
      this.openUntilMs = now + this.openMs;
      this.halfOpenProbeConsumed = false;
    }
  }

  openUntil(): number {
    return this.openUntilMs;
  }

  getState(now = Date.now()): BreakerState {
    this.moveToHalfOpen(now);
    return this.state;
  }
}
