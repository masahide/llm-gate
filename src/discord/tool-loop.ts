import { getAssistantName, isAssistantDebugEnabled } from "../config/assistant.js";
import { cfg } from "../config/lm.js";
import {
  buildAssistantInstructions,
  needsCurrentTime,
  needsWebResearch,
  normalizeWebResearchParams,
} from "./tool-loop-policy.js";
import { createResponse, extractOutputText } from "../lmstudio.js";
import type { LmConfig, ResponseFunctionCall, ResponsesResponse } from "../lmstudio.js";
import {
  currentTimeTool,
  formatCurrentTime,
  parseCurrentTimeParams,
} from "../tools/current-time.js";
import {
  parseWebResearchDigestParams,
  runWebResearchDigest,
  webResearchDigestTool,
} from "../tools/web-research-digest.js";

type FunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

type ToolLoopOptions = {
  lmConfig?: LmConfig;
  maxLoops?: number;
};

const DEFAULT_MAX_LOOPS = 4;
const DEFAULT_LM_TIMEOUT_MS = 90000;

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

function collectFunctionCalls(response: ResponsesResponse): ResponseFunctionCall[] {
  const out = response.output ?? [];
  return out.filter((item): item is ResponseFunctionCall => item.type === "function_call");
}

function hasFunctionCall(response: ResponsesResponse, toolName: string): boolean {
  return collectFunctionCalls(response).some((call) => call.name === toolName);
}

async function executeCall(
  call: ResponseFunctionCall,
  fallbackQuery: string
): Promise<FunctionCallOutput> {
  debugLog("[tool debug] execute function_call", {
    name: call.name,
    callId: call.call_id ?? null,
    inputPreview: (call.input ?? "").slice(0, 300),
  });

  if (call.name === currentTimeTool.name) {
    const params = parseCurrentTimeParams(call.input);
    const output = formatCurrentTime(params);
    return {
      type: "function_call_output",
      call_id: call.call_id ?? call.name,
      output,
    };
  }

  if (call.name === webResearchDigestTool.name) {
    const parsed = parseWebResearchDigestParams(call.input);
    const params = normalizeWebResearchParams(parsed, fallbackQuery);
    debugLog("[tool debug] normalized web_research_digest params", {
      usedFallbackQuery: !parsed.query,
      queryPreview: params.query.slice(0, 120),
      maxResults: params.maxResults,
      maxPages: params.maxPages,
    });
    const output = await runWebResearchDigest(params);
    return {
      type: "function_call_output",
      call_id: call.call_id ?? call.name,
      output: JSON.stringify(output),
    };
  }

  return {
    type: "function_call_output",
    call_id: call.call_id ?? call.name,
    output: JSON.stringify({ errors: [{ code: "unknown_tool", message: call.name }] }),
  };
}

export async function queryLmStudioResponseWithTools(
  inputText: string,
  options: ToolLoopOptions = {}
): Promise<string> {
  const lmConfig = options.lmConfig ?? cfg;
  const maxLoops = options.maxLoops ?? DEFAULT_MAX_LOOPS;
  const timeoutMs = resolveLmTimeoutMs();
  const forceWebResearch = needsWebResearch(inputText);
  const forceCurrentTime = needsCurrentTime(inputText);
  const tools = [currentTimeTool, webResearchDigestTool];
  const instructions = buildAssistantInstructions({
    assistantName: getAssistantName(),
    today: new Date().toISOString().slice(0, 10),
    forceWebResearch,
    forceCurrentTime,
  });

  let response = await createResponse(lmConfig, inputText, {
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
  });

  const mustRetryForWebResearch =
    forceWebResearch && !hasFunctionCall(response, webResearchDigestTool.name);
  const mustRetryForCurrentTime =
    forceCurrentTime && !hasFunctionCall(response, currentTimeTool.name);
  if (mustRetryForWebResearch || mustRetryForCurrentTime) {
    const strictLines = [instructions];
    if (mustRetryForWebResearch) {
      strictLines.push("IMPORTANT: Do not answer directly before calling web_research_digest.");
    }
    if (mustRetryForCurrentTime) {
      strictLines.push("IMPORTANT: Do not answer directly before calling current_time.");
    }
    const strictInstructions = strictLines.join("\n");
    response = await createResponse(lmConfig, inputText, {
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
    });
  }

  for (let i = 0; i < maxLoops; i += 1) {
    const calls = collectFunctionCalls(response);
    debugLog("[tool debug] tool loop step", {
      step: i + 1,
      callCount: calls.length,
      callNames: calls.map((call) => call.name),
    });
    if (calls.length === 0) {
      const text = extractOutputText(response).trim();
      debugLog("[tool debug] no function_call, return message", {
        textPreview: text.slice(0, 300),
      });
      return text || "少しお待ちください、確認しています。";
    }

    const outputs: FunctionCallOutput[] = [];
    for (const call of calls) {
      outputs.push(await executeCall(call, inputText));
    }

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
  debugLog("[tool debug] reached maxLoops", {
    maxLoops,
    textPreview: fallback.slice(0, 300),
  });
  return fallback || "調査に時間がかかっています。もう一度試してください。";
}
