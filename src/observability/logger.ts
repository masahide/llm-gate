import type { RequestContext } from "./request-context.js";

export type LogLevel = "info" | "warn" | "error";

const DEFAULT_MAX_CHARS = 2000;
const REDACTED = "[REDACTED]";

function readMaxChars(): number {
  const raw = Number(process.env.LOG_MAX_CHARS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_CHARS;
  return Math.max(100, Math.floor(raw));
}

function replaceSecrets(text: string): string {
  let out = text;
  const secretToken = process.env.SEVEN_DTD_OPS_TOKEN;
  if (secretToken) {
    out = out.split(secretToken).join(REDACTED);
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  return out;
}

export function truncateForLog(text: string, maxChars = readMaxChars()): string {
  if (text.length <= maxChars) return text;
  const suffix = "...[truncated]";
  if (maxChars <= suffix.length) return suffix.slice(0, maxChars);
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

export function redactForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return truncateForLog(replaceSecrets(value));
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item));
  }
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/authorization|token/i.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactForLog(raw);
  }
  return out;
}

function toPathOnly(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.pathname}${url.hash ?? ""}`;
  } catch {
    return endpoint.split("?")[0] ?? endpoint;
  }
}

type LogFields = Record<string, unknown>;

function normalizeFields(fields?: LogFields): LogFields {
  if (!fields) return {};
  const normalized: LogFields = { ...fields };
  const endpoint = normalized["http.endpoint"];
  if (typeof endpoint === "string") {
    normalized["http.endpoint"] = toPathOnly(endpoint);
  }
  return redactForLog(normalized) as LogFields;
}

function emit(level: LogLevel, message: string, ctx?: RequestContext, fields?: LogFields): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(ctx
      ? {
          requestId: ctx.requestId,
          discord: {
            guildId: ctx.guildId,
            effectiveChannelId: ctx.effectiveChannelId,
            threadId: ctx.threadId,
            messageId: ctx.messageId,
          },
          tool: {
            persona: ctx.persona,
            enabledTools: ctx.enabledTools,
          },
        }
      : {}),
    ...normalizeFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, ctx?: RequestContext, fields?: LogFields): void {
    emit("info", message, ctx, fields);
  },
  warn(message: string, ctx?: RequestContext, fields?: LogFields): void {
    emit("warn", message, ctx, fields);
  },
  error(message: string, ctx?: RequestContext, fields?: LogFields): void {
    emit("error", message, ctx, fields);
  },
};
