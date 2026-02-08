export type SevenDtdOpsClient = {
  getStatus: () => Promise<unknown>;
  getSummary: (params?: { minutes?: number }) => Promise<unknown>;
  getLogs: (params?: { lines?: number }) => Promise<unknown>;
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  restart: () => Promise<unknown>;
  execCommand: (command: string) => Promise<unknown>;
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

function encodeQuery(params: Record<string, string | number | undefined>): string {
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
  payload?: unknown
): Promise<unknown> {
  if (!config.token) {
    throw new Error("seven_dtd_missing_token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      const trimmed = body.slice(0, 300);
      const redacted = config.token ? trimmed.split(config.token).join("[REDACTED]") : trimmed;
      throw new Error(`seven_dtd_http_error:${response.status}:${redacted}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as unknown;
    }

    return { ok: true, text: await response.text() };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("seven_dtd_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createSevenDtdOpsClientFromEnv(): SevenDtdOpsClient {
  const config = buildSevenDtdOpsClientConfigFromEnv();

  return {
    getStatus: () => requestJson(config, "GET", "/api/status"),
    getSummary: (params) => {
      const minutes = clampInt(params?.minutes, 1, 1440, 60);
      return requestJson(config, "GET", `/api/summary${encodeQuery({ minutes })}`);
    },
    getLogs: (params) => {
      const lines = clampInt(params?.lines, 1, 200, 50);
      return requestJson(config, "GET", `/api/logs${encodeQuery({ lines })}`);
    },
    start: () => requestJson(config, "POST", "/api/start"),
    stop: () => requestJson(config, "POST", "/api/stop"),
    restart: () => requestJson(config, "POST", "/api/restart"),
    execCommand: (command) =>
      requestJson(config, "POST", "/api/exec", { command: command.slice(0, 500) }),
  };
}
