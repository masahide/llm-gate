import { logger } from "../observability/logger.js";
import type { RequestContext } from "../observability/request-context.js";
import { SevenDtdCircuitBreaker, readCircuitBreakerConfigFromEnv } from "./circuit-breaker.js";
import {
  buildHttpErrorMessage,
  extractErrorCauseInfo,
  normalizeRequestError,
  parseSuccessResponseBody,
} from "./client-core.js";

export type SevenDtdOpsClient = {
  getStatus: (ctx?: RequestContext) => Promise<unknown>;
  getSummary: (
    params?: {
      includePositions?: boolean;
      maskIPs?: boolean;
      limitHostiles?: number;
      timeoutSeconds?: number;
      verbose?: boolean;
    },
    ctx?: RequestContext
  ) => Promise<unknown>;
  getLogs: (params?: { lines?: number }, ctx?: RequestContext) => Promise<unknown>;
  start: (ctx?: RequestContext) => Promise<unknown>;
  stop: (ctx?: RequestContext) => Promise<unknown>;
  restart: (ctx?: RequestContext) => Promise<unknown>;
  execCommand: (command: string, ctx?: RequestContext) => Promise<unknown>;
};

type RequestMethod = "GET" | "POST";

type SevenDtdOpsClientConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
};

const DEFAULT_BASE_URL = "https://stats7dtd.suzu.me.uk";
const DEFAULT_TIMEOUT_MS = 10000;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function readTimeoutMsFromEnv(): number {
  return clampInt(process.env.SEVEN_DTD_OPS_TIMEOUT_MS, 1000, 60000, DEFAULT_TIMEOUT_MS);
}

export function readSevenDtdWriteToolsEnabled(): boolean {
  return process.env.SEVEN_DTD_ENABLE_WRITE_TOOLS === "true";
}

export function buildSevenDtdOpsClientConfigFromEnv(): SevenDtdOpsClientConfig {
  return {
    baseUrl: (process.env.SEVEN_DTD_OPS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    token: process.env.SEVEN_DTD_OPS_TOKEN ?? "",
    timeoutMs: readTimeoutMsFromEnv(),
  };
}

function encodeQuery(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    sp.set(key, String(value));
  }
  const query = sp.toString();
  return query ? `?${query}` : "";
}

async function requestJson(
  config: SevenDtdOpsClientConfig,
  method: RequestMethod,
  path: string,
  payload?: unknown,
  ctx?: RequestContext,
  breaker?: SevenDtdCircuitBreaker
): Promise<unknown> {
  const startedAt = Date.now();
  const endpoint = `${config.baseUrl}${path}`;
  let failureRecorded = false;
  if (!config.token) {
    throw new Error("seven_dtd_missing_token");
  }
  const now = Date.now();
  if (breaker?.isOpen(now) && !breaker.canProbe(now)) {
    throw new Error("seven_dtd_circuit_open");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      breaker?.recordFailure();
      failureRecorded = true;
      const body = await response.text();
      throw new Error(buildHttpErrorMessage(response.status, body, config.token));
    }

    const data = await parseSuccessResponseBody(response);
    breaker?.recordSuccess();
    logger.info("[seven_dtd] request success", ctx, {
      "tool.call.durationMs": Date.now() - startedAt,
      "http.status": response.status,
      "http.durationMs": Date.now() - startedAt,
      "http.endpoint": endpoint,
    });
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      breaker?.recordFailure();
      failureRecorded = true;
      throw new Error("seven_dtd_timeout");
    }
    const rawError = error instanceof Error ? error : new Error(String(error));
    const cause = extractErrorCauseInfo(rawError);
    const normalizedError = normalizeRequestError(error);
    const code = normalizedError.message;
    if (!code.startsWith("seven_dtd_circuit_open") && !failureRecorded) {
      breaker?.recordFailure();
    }
    logger.warn("[seven_dtd] request failed", ctx, {
      "error.code": code.split(":")[0],
      "error.message": code.slice(0, 300),
      ...(cause.name ? { "error.cause.name": cause.name } : {}),
      ...(cause.code ? { "error.cause.code": cause.code } : {}),
      "http.durationMs": Date.now() - startedAt,
      "http.endpoint": endpoint,
    });
    throw normalizedError;
  } finally {
    clearTimeout(timeout);
  }
}

export function createSevenDtdOpsClientFromEnv(): SevenDtdOpsClient {
  const config = buildSevenDtdOpsClientConfigFromEnv();
  const breaker = new SevenDtdCircuitBreaker(readCircuitBreakerConfigFromEnv());

  return {
    getStatus: (ctx) => requestJson(config, "GET", "/server/status", undefined, ctx, breaker),
    getSummary: (params, ctx) => {
      const includePositions =
        typeof params?.includePositions === "boolean" ? params.includePositions : undefined;
      const maskIPs = typeof params?.maskIPs === "boolean" ? params.maskIPs : undefined;
      const limitHostiles = clampInt(params?.limitHostiles, 0, 2000, 200);
      const timeoutSeconds = clampInt(params?.timeoutSeconds, 1, 15, 10);
      const verbose = typeof params?.verbose === "boolean" ? params.verbose : undefined;
      return requestJson(
        config,
        "GET",
        `/server/summary${encodeQuery({
          includePositions,
          maskIPs,
          limitHostiles,
          timeoutSeconds,
          verbose,
        })}`,
        undefined,
        ctx,
        breaker
      );
    },
    getLogs: (params, ctx) => {
      const lines = clampInt(params?.lines, 1, 200, 50);
      return requestJson(
        config,
        "GET",
        `/server/logs${encodeQuery({ lines })}`,
        undefined,
        ctx,
        breaker
      );
    },
    start: (ctx) => requestJson(config, "GET", "/server/start", undefined, ctx, breaker),
    stop: (ctx) => requestJson(config, "GET", "/server/stop", undefined, ctx, breaker),
    restart: (ctx) => requestJson(config, "GET", "/server/restart", undefined, ctx, breaker),
    execCommand: (command, ctx) =>
      requestJson(
        config,
        "GET",
        `/server/command${encodeQuery({ command: command.slice(0, 500) })}`,
        undefined,
        ctx,
        breaker
      ),
  };
}
