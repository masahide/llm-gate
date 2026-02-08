import { getAssistantName, isAssistantDebugEnabled } from "../config/assistant.js";
import { cfg } from "../config/lm.js";
import {
  buildAssistantInstructions,
  extractLatestUserInput,
  needsAssistantProfile,
  needsCurrentTime,
  needsWebResearch,
  normalizeWebResearchParams,
} from "./tool-loop-policy.js";
import type { AssistantPersona } from "./tool-loop-policy.js";
import { createResponse, extractOutputText } from "../lmstudio.js";
import type {
  LmConfig,
  ResponseFunctionCall,
  ResponseInput,
  ResponsesResponse,
} from "../lmstudio.js";
import {
  currentTimeTool,
  formatCurrentTime,
  parseCurrentTimeParams,
} from "../tools/current-time.js";
import {
  parseWebResearchDigestParams,
  runWebResearchDigest,
  type WebResearchDigestOutput,
  webResearchDigestTool,
} from "../tools/web-research-digest.js";
import { assistantProfileTool, runAssistantProfile } from "../tools/assistant-profile.js";
import { baseTools } from "./tool-registry.js";
import {
  createSevenDtdOpsClientFromEnv,
  readSevenDtdWriteToolsEnabled,
} from "../seven-dtd/client.js";
import { isSevenDtdToolName, runSevenDtdToolCall } from "../tools/seven-dtd-ops.js";
import type { RequestContext } from "../observability/request-context.js";
import { logger } from "../observability/logger.js";

type FunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

type ExecuteCallResult = {
  output: FunctionCallOutput;
  webCitationUrls?: string[];
};

export type ToolLoopPersona = AssistantPersona;

export type ToolLoopOptions = {
  lmConfig?: LmConfig;
  maxLoops?: number;
  tools?: unknown[];
  persona?: ToolLoopPersona;
};

export type ToolLoopInput = string | { text: string; imageUrls?: string[] };

const DEFAULT_MAX_LOOPS = 4;
const DEFAULT_LM_TIMEOUT_MS = 90000;
const MAX_INPUT_IMAGE_URLS = 4;

type PayloadSizeStats = {
  shape: "string" | "array" | "object" | "unknown";
  chars: number;
  bytes: number;
  preview: string;
};

function isDebugEnabled(): boolean {
  return process.env.DEBUG_WEB_RESEARCH === "true" || isAssistantDebugEnabled();
}

function debugLog(message: string, payload: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  console.debug(message, payload);
}

function resolveLmTimeoutMs(): number {
  const raw = process.env.LM_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
  return DEFAULT_LM_TIMEOUT_MS;
}

function formatJstNow(now: Date): { todayJst: string; weekdayJst: string; nowJst: string } {
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

function debugRequestSummary(params: {
  stage: "initial" | "forced_retry" | "follow_up";
  input: ResponseInput;
  instructions?: string;
  tools: unknown[];
  previousResponseId?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs: number;
}): void {
  const inputSize = measurePayloadSize(params.input);
  const toolsSize = measureJsonSize(params.tools);
  const instructionsSize =
    typeof params.instructions === "string" ? measureTextSize(params.instructions) : undefined;

  debugLog("[tool debug] lm request payload summary", {
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
  });
}

function buildInitialResponseInput(input: ToolLoopInput): ResponseInput {
  if (typeof input === "string") return input;
  const text = input.text;
  const imageUrls = (input.imageUrls ?? [])
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .slice(0, MAX_INPUT_IMAGE_URLS);
  if (imageUrls.length === 0) return text;

  const content = [
    { type: "input_text", text },
    ...imageUrls.map((url) => ({ type: "input_image", image_url: url })),
  ];
  return [{ role: "user", content }];
}

function collectFunctionCalls(response: ResponsesResponse): ResponseFunctionCall[] {
  const out = response.output ?? [];
  return out.filter((item): item is ResponseFunctionCall => item.type === "function_call");
}

function hasFunctionCall(response: ResponsesResponse, toolName: string): boolean {
  return collectFunctionCalls(response).some((call) => call.name === toolName);
}

function resolveFunctionCallInput(call: ResponseFunctionCall): {
  payload: string | undefined;
  source: "input" | "arguments" | "none";
} {
  if (typeof call.input === "string" && call.input.length > 0) {
    return { payload: call.input, source: "input" };
  }
  if (typeof call.arguments === "string" && call.arguments.length > 0) {
    return { payload: call.arguments, source: "arguments" };
  }
  return { payload: undefined, source: "none" };
}

async function executeCall(
  call: ResponseFunctionCall,
  fallbackQuery: string,
  options: {
    sevenDtdWriteEnabled: boolean;
    sevenDtdClient: ReturnType<typeof createSevenDtdOpsClientFromEnv>;
    requestContext?: RequestContext;
  }
): Promise<ExecuteCallResult> {
  const resolvedInput = resolveFunctionCallInput(call);
  debugLog("[tool debug] execute function_call", {
    rawFunctionCall: call,
    name: call.name,
    callId: call.call_id ?? null,
    inputSource: resolvedInput.source,
    inputPreview: (resolvedInput.payload ?? "").slice(0, 300),
  });

  if (call.name === currentTimeTool.name) {
    const params = parseCurrentTimeParams(resolvedInput.payload);
    const output = formatCurrentTime(params);
    return {
      output: {
        type: "function_call_output",
        call_id: call.call_id ?? call.name,
        output,
      },
    };
  }

  if (call.name === webResearchDigestTool.name) {
    const rawInput = resolvedInput.payload ?? "";
    const parsed = parseWebResearchDigestParams(resolvedInput.payload);
    const params = normalizeWebResearchParams(parsed, fallbackQuery);
    debugLog("[tool debug] normalized web_research_digest params", {
      usedFallbackQuery: !parsed.query,
      inputSource: resolvedInput.source,
      rawInputPreview: rawInput.slice(0, 300),
      parsedQueryPreview: parsed.query.slice(0, 120),
      queryPreview: params.query.slice(0, 120),
      maxResults: params.maxResults,
      maxPages: params.maxPages,
    });
    const output = await runWebResearchDigest(params);
    const webOutput = output as WebResearchDigestOutput;
    const webCitationUrls = webOutput.citations
      .map((citation) => citation.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    return {
      output: {
        type: "function_call_output",
        call_id: call.call_id ?? call.name,
        output: JSON.stringify(output),
      },
      webCitationUrls,
    };
  }

  if (call.name === assistantProfileTool.name) {
    const output = runAssistantProfile();
    return {
      output: {
        type: "function_call_output",
        call_id: call.call_id ?? call.name,
        output: JSON.stringify(output),
      },
    };
  }

  if (isSevenDtdToolName(call.name)) {
    const sevenDtdInput = resolvedInput.payload;
    const output = await runSevenDtdToolCall({
      toolName: call.name,
      writeEnabled: options.sevenDtdWriteEnabled,
      client: options.sevenDtdClient,
      ...(options.requestContext ? { requestContext: options.requestContext } : {}),
      ...(sevenDtdInput ? { rawInput: sevenDtdInput } : {}),
    });
    return {
      output: {
        type: "function_call_output",
        call_id: call.call_id ?? call.name,
        output,
      },
    };
  }

  return {
    output: {
      type: "function_call_output",
      call_id: call.call_id ?? call.name,
      output: JSON.stringify({ errors: [{ code: "unknown_tool", message: call.name }] }),
    },
  };
}

function appendCitationsIfNeeded(text: string, citationUrls: string[]): string {
  if (citationUrls.length === 0) return text;
  if (/https?:\/\/\S+/i.test(text)) return text;

  const uniqueUrls = [...new Set(citationUrls)].slice(0, 5);
  if (uniqueUrls.length === 0) return text;
  const sources = uniqueUrls.map((url) => `- ${url}`).join("\n");
  return `${text}\n\n参照元:\n${sources}`;
}

export async function queryLmStudioResponseWithTools(
  input: ToolLoopInput,
  options: ToolLoopOptions = {},
  requestContext?: RequestContext
): Promise<string> {
  const lmConfig = options.lmConfig ?? cfg;
  const inputText = typeof input === "string" ? input : input.text;
  const initialInput = buildInitialResponseInput(input);
  const latestUserInput = extractLatestUserInput(inputText);
  const maxLoops = options.maxLoops ?? DEFAULT_MAX_LOOPS;
  const timeoutMs = resolveLmTimeoutMs();
  const forceWebResearch = needsWebResearch(latestUserInput);
  const forceCurrentTime = needsCurrentTime(latestUserInput);
  const forceAssistantProfile = needsAssistantProfile(latestUserInput);
  const tools = options.tools ?? baseTools();
  const sevenDtdClient = createSevenDtdOpsClientFromEnv();
  const sevenDtdWriteEnabled = readSevenDtdWriteToolsEnabled();
  const jstNow = formatJstNow(new Date());
  const instructions = buildAssistantInstructions({
    assistantName: getAssistantName(),
    todayJst: jstNow.todayJst,
    weekdayJst: jstNow.weekdayJst,
    nowJst: jstNow.nowJst,
    forceWebResearch,
    forceCurrentTime,
    forceAssistantProfile,
    persona: options.persona ?? "default",
  });

  debugRequestSummary({
    stage: "initial",
    input: initialInput,
    instructions,
    tools,
    maxOutputTokens: 700,
    temperature: 0.2,
    timeoutMs,
  });

  let response = await createResponse(lmConfig, initialInput, {
    temperature: 0.2,
    maxOutputTokens: 700,
    instructions,
    timeoutMs,
    tools,
  });
  debugLog("[tool debug] initial response", {
    responseId: response.id ?? null,
    outputTypes: (response.output ?? []).map((item) => item.type),
    forceWebResearch,
    forceCurrentTime,
    forceAssistantProfile,
  });
  logger.info("[tool_loop] initial response", requestContext, {
    "tool.call.name": "initial",
    "tool.enabledTools": tools
      .map((tool) => {
        if (!tool || typeof tool !== "object") return "";
        const name = (tool as { name?: unknown }).name;
        return typeof name === "string" ? name : "";
      })
      .filter((name) => name.length > 0),
  });

  const mustRetryForWebResearch =
    forceWebResearch && !hasFunctionCall(response, webResearchDigestTool.name);
  const mustRetryForCurrentTime =
    forceCurrentTime && !hasFunctionCall(response, currentTimeTool.name);
  const mustRetryForAssistantProfile =
    forceAssistantProfile && !hasFunctionCall(response, assistantProfileTool.name);
  if (mustRetryForWebResearch || mustRetryForCurrentTime || mustRetryForAssistantProfile) {
    const strictLines = [instructions];
    if (mustRetryForWebResearch) {
      strictLines.push("IMPORTANT: Do not answer directly before calling web_research_digest.");
    }
    if (mustRetryForCurrentTime) {
      strictLines.push("IMPORTANT: Do not answer directly before calling current_time.");
    }
    if (mustRetryForAssistantProfile) {
      strictLines.push("IMPORTANT: Do not answer directly before calling assistant_profile.");
    }
    const strictInstructions = strictLines.join("\n");
    debugRequestSummary({
      stage: "forced_retry",
      input: initialInput,
      instructions: strictInstructions,
      tools,
      maxOutputTokens: 700,
      temperature: 0.1,
      timeoutMs,
    });
    response = await createResponse(lmConfig, initialInput, {
      temperature: 0.1,
      maxOutputTokens: 700,
      instructions: strictInstructions,
      timeoutMs,
      tools,
    });
    debugLog("[tool debug] forced tool retry response", {
      responseId: response.id ?? null,
      outputTypes: (response.output ?? []).map((item) => item.type),
      mustRetryForWebResearch,
      mustRetryForCurrentTime,
      mustRetryForAssistantProfile,
    });
  }
  const webCitationUrls: string[] = [];

  for (let i = 0; i < maxLoops; i += 1) {
    const calls = collectFunctionCalls(response);
    debugLog("[tool debug] tool loop step", {
      step: i + 1,
      callCount: calls.length,
      callNames: calls.map((call) => call.name),
    });
    if (calls.length === 0) {
      const text = extractOutputText(response).trim();
      const withCitations = appendCitationsIfNeeded(text, webCitationUrls);
      debugLog("[tool debug] no function_call, return message", {
        textPreview: withCitations.slice(0, 300),
      });
      return withCitations || "少しお待ちください、確認しています。";
    }

    const outputs: FunctionCallOutput[] = [];
    for (const call of calls) {
      const callStartedAt = Date.now();
      const executed = await executeCall(call, latestUserInput, {
        sevenDtdWriteEnabled,
        sevenDtdClient,
        ...(requestContext ? { requestContext } : {}),
      });
      outputs.push(executed.output);
      logger.info("[tool_loop] function call executed", requestContext, {
        "tool.call.name": call.name,
        "tool.call.durationMs": Date.now() - callStartedAt,
      });
      if (executed.webCitationUrls) {
        webCitationUrls.push(...executed.webCitationUrls);
      }
    }

    debugRequestSummary({
      stage: "follow_up",
      input: outputs,
      tools,
      ...(response.id ? { previousResponseId: response.id } : {}),
      timeoutMs,
    });

    response = await createResponse(lmConfig, outputs, {
      previousResponseId: response.id,
      tools,
      timeoutMs,
    });
    debugLog("[tool debug] follow-up response", {
      responseId: response.id ?? null,
      outputTypes: (response.output ?? []).map((item) => item.type),
    });
  }

  const fallback = extractOutputText(response).trim();
  const fallbackWithCitations = appendCitationsIfNeeded(fallback, webCitationUrls);
  debugLog("[tool debug] reached maxLoops", {
    maxLoops,
    textPreview: fallbackWithCitations.slice(0, 300),
  });
  return fallbackWithCitations || "調査に時間がかかっています。もう一度試してください。";
}
