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
  type WebResearchDigestOutput,
  webResearchDigestTool,
} from "../tools/web-research-digest.js";
import { assistantProfileTool, runAssistantProfile } from "../tools/assistant-profile.js";

type FunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

type ExecuteCallResult = {
  output: FunctionCallOutput;
  webCitationUrls?: string[];
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
  fallbackQuery: string
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
  inputText: string,
  options: ToolLoopOptions = {}
): Promise<string> {
  const lmConfig = options.lmConfig ?? cfg;
  const latestUserInput = extractLatestUserInput(inputText);
  const maxLoops = options.maxLoops ?? DEFAULT_MAX_LOOPS;
  const timeoutMs = resolveLmTimeoutMs();
  const forceWebResearch = needsWebResearch(latestUserInput);
  const forceCurrentTime = needsCurrentTime(latestUserInput);
  const forceAssistantProfile = needsAssistantProfile(latestUserInput);
  const tools = [currentTimeTool, webResearchDigestTool, assistantProfileTool];
  const instructions = buildAssistantInstructions({
    assistantName: getAssistantName(),
    today: new Date().toISOString().slice(0, 10),
    forceWebResearch,
    forceCurrentTime,
    forceAssistantProfile,
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
    forceAssistantProfile,
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
      const executed = await executeCall(call, latestUserInput);
      outputs.push(executed.output);
      if (executed.webCitationUrls) {
        webCitationUrls.push(...executed.webCitationUrls);
      }
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
  const fallbackWithCitations = appendCitationsIfNeeded(fallback, webCitationUrls);
  debugLog("[tool debug] reached maxLoops", {
    maxLoops,
    textPreview: fallbackWithCitations.slice(0, 300),
  });
  return fallbackWithCitations || "調査に時間がかかっています。もう一度試してください。";
}
