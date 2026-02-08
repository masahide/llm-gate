import { isAssistantDebugEnabled } from "../config/assistant.js";
import type { ResponseInput } from "../lmstudio.js";
import type { LmToolDefinition } from "../lmstudio.js";

const DEFAULT_LM_TIMEOUT_MS = 90000;

type PayloadSizeStats = {
  shape: "string" | "array" | "object" | "unknown";
  chars: number;
  bytes: number;
  preview: string;
};

function measurePayloadSize(input: ResponseInput): PayloadSizeStats {
  if (typeof input === "string") {
    return {
      shape: "string",
      chars: input.length,
      bytes: Buffer.byteLength(input, "utf8"),
      preview: input.slice(0, 200),
    };
  }

  const shape = Array.isArray(input) ? "array" : typeof input === "object" ? "object" : "unknown";
  try {
    const json = JSON.stringify(input);
    return {
      shape,
      chars: json.length,
      bytes: Buffer.byteLength(json, "utf8"),
      preview: json.slice(0, 200),
    };
  } catch {
    return {
      shape,
      chars: -1,
      bytes: -1,
      preview: "[unserializable payload]",
    };
  }
}

function measureTextSize(text: string): { chars: number; bytes: number; preview: string } {
  return {
    chars: text.length,
    bytes: Buffer.byteLength(text, "utf8"),
    preview: text.slice(0, 200),
  };
}

function measureJsonSize(value: unknown): { chars: number; bytes: number } {
  try {
    const json = JSON.stringify(value);
    return {
      chars: json.length,
      bytes: Buffer.byteLength(json, "utf8"),
    };
  } catch {
    return { chars: -1, bytes: -1 };
  }
}

export function isToolLoopDebugEnabled(): boolean {
  return process.env.DEBUG_WEB_RESEARCH === "true" || isAssistantDebugEnabled();
}

export function debugLog(message: string, payload: Record<string, unknown>): void {
  if (!isToolLoopDebugEnabled()) return;
  console.debug(message, payload);
}

export function resolveLmTimeoutMsFromEnv(raw: string | undefined): number {
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
  return DEFAULT_LM_TIMEOUT_MS;
}

export function resolveLmTimeoutMs(): number {
  return resolveLmTimeoutMsFromEnv(process.env.LM_TIMEOUT_MS);
}

export function formatJstNow(now: Date): { todayJst: string; weekdayJst: string; nowJst: string } {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);

  const year = dateParts.find((part) => part.type === "year")?.value ?? "0000";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "00";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "00";
  const hour = timeParts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = timeParts.find((part) => part.type === "minute")?.value ?? "00";
  const second = timeParts.find((part) => part.type === "second")?.value ?? "00";
  const todayJst = `${year}-${month}-${day}`;
  const weekdayJst = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
  }).format(now);

  return {
    todayJst,
    weekdayJst,
    nowJst: `${todayJst} ${hour}:${minute}:${second}`,
  };
}

export function buildDebugRequestSummaryPayload(params: {
  stage: "initial" | "forced_retry" | "follow_up";
  input: ResponseInput;
  instructions?: string;
  tools: LmToolDefinition[];
  previousResponseId?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs: number;
}): Record<string, unknown> {
  const inputSize = measurePayloadSize(params.input);
  const toolsSize = measureJsonSize(params.tools);
  const instructionsSize =
    typeof params.instructions === "string" ? measureTextSize(params.instructions) : undefined;

  return {
    stage: params.stage,
    previousResponseId: params.previousResponseId ?? null,
    maxOutputTokens: params.maxOutputTokens ?? null,
    temperature: params.temperature ?? null,
    timeoutMs: params.timeoutMs,
    inputShape: inputSize.shape,
    inputChars: inputSize.chars,
    inputBytes: inputSize.bytes,
    inputPreview: inputSize.preview,
    instructionsChars: instructionsSize?.chars ?? null,
    instructionsBytes: instructionsSize?.bytes ?? null,
    instructionsPreview: instructionsSize?.preview ?? null,
    toolsCount: params.tools.length,
    toolsJsonChars: toolsSize.chars,
    toolsJsonBytes: toolsSize.bytes,
  };
}

export function debugRequestSummary(params: {
  stage: "initial" | "forced_retry" | "follow_up";
  input: ResponseInput;
  instructions?: string;
  tools: LmToolDefinition[];
  previousResponseId?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs: number;
}): void {
  debugLog("[tool debug] lm request payload summary", buildDebugRequestSummaryPayload(params));
}
