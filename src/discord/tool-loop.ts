import { getAssistantName } from "../config/assistant.js";
import { cfg } from "../config/lm.js";
import {
  buildAssistantInstructions,
  extractLatestUserInput,
  needsAssistantProfile,
  needsCurrentTime,
  needsWebResearch,
} from "./tool-loop-policy.js";
import type { AssistantPersona } from "./tool-loop-policy.js";
import { createResponse, extractOutputText } from "../lmstudio.js";
import type { LmConfig, LmToolDefinition, ResponseFunctionCall } from "../lmstudio.js";
import {
  currentTimeTool,
  formatCurrentTime,
  parseCurrentTimeParams,
} from "../tools/current-time.js";
import { runWebResearchDigest, webResearchDigestTool } from "../tools/web-research-digest.js";
import { assistantProfileTool, runAssistantProfile } from "../tools/assistant-profile.js";
import { baseTools } from "./tool-registry.js";
import {
  createSevenDtdOpsClientFromEnv,
  readSevenDtdWriteToolsEnabled,
} from "../seven-dtd/client.js";
import { isSevenDtdToolName, runSevenDtdToolCall } from "../tools/seven-dtd-ops.js";
import type { RequestContext } from "../observability/request-context.js";
import { logger } from "../observability/logger.js";
import {
  appendCitationsIfNeeded,
  buildForcedRetryPlan,
  buildInitialResponseInput,
  collectFunctionCalls,
  extractWebCitationUrls,
  extractEnabledToolNames,
  hasFunctionCall,
  normalizeWebResearchDigestCall,
  resolveFunctionCallInput,
} from "./tool-loop-core.js";
import {
  debugLog,
  debugRequestSummary,
  formatJstNow,
  resolveLmTimeoutMs,
} from "./tool-loop-debug.js";

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
  tools?: LmToolDefinition[];
  persona?: ToolLoopPersona;
};

export type ToolLoopInput = string | { text: string; imageUrls?: string[] };

const DEFAULT_MAX_LOOPS = 4;

type ExecuteCallOptions = {
  sevenDtdWriteEnabled: boolean;
  sevenDtdClient: ReturnType<typeof createSevenDtdOpsClientFromEnv>;
  requestContext?: RequestContext;
};

type ResolvedCallContext = {
  call: ResponseFunctionCall;
  resolvedInput: ReturnType<typeof resolveFunctionCallInput>;
  fallbackQuery: string;
  options: ExecuteCallOptions;
};

type ToolCallHandler = (ctx: ResolvedCallContext) => Promise<ExecuteCallResult> | ExecuteCallResult;

function asFunctionCallOutput(call: ResponseFunctionCall, output: string): FunctionCallOutput {
  return {
    type: "function_call_output",
    call_id: call.call_id ?? call.name,
    output,
  };
}

const currentTimeHandler: ToolCallHandler = ({ call, resolvedInput }) => {
  const params = parseCurrentTimeParams(resolvedInput.payload);
  const output = formatCurrentTime(params);
  return { output: asFunctionCallOutput(call, output) };
};

const webResearchHandler: ToolCallHandler = async ({ call, resolvedInput, fallbackQuery }) => {
  const rawInput = resolvedInput.payload ?? "";
  const normalized = normalizeWebResearchDigestCall({
    fallbackQuery,
    ...(resolvedInput.payload !== undefined ? { rawInput: resolvedInput.payload } : {}),
  });
  debugLog("[tool debug] normalized web_research_digest params", {
    usedFallbackQuery: normalized.usedFallbackQuery,
    inputSource: resolvedInput.source,
    rawInputPreview: rawInput.slice(0, 300),
    parsedQueryPreview: normalized.parsed.query.slice(0, 120),
    queryPreview: normalized.params.query.slice(0, 120),
    maxResults: normalized.params.maxResults,
    maxPages: normalized.params.maxPages,
  });
  const output = await runWebResearchDigest(normalized.params);
  const webCitationUrls = extractWebCitationUrls(output);
  return {
    output: asFunctionCallOutput(call, JSON.stringify(output)),
    webCitationUrls,
  };
};

const assistantProfileHandler: ToolCallHandler = ({ call }) => {
  const output = runAssistantProfile();
  return { output: asFunctionCallOutput(call, JSON.stringify(output)) };
};

const staticToolHandlers: Record<string, ToolCallHandler> = {
  [currentTimeTool.name]: currentTimeHandler,
  [webResearchDigestTool.name]: webResearchHandler,
  [assistantProfileTool.name]: assistantProfileHandler,
};

const sevenDtdHandler: ToolCallHandler = async ({ call, resolvedInput, options }) => {
  const sevenDtdInput = resolvedInput.payload;
  const output = await runSevenDtdToolCall({
    toolName: call.name as Parameters<typeof runSevenDtdToolCall>[0]["toolName"],
    writeEnabled: options.sevenDtdWriteEnabled,
    client: options.sevenDtdClient,
    ...(options.requestContext ? { requestContext: options.requestContext } : {}),
    ...(sevenDtdInput ? { rawInput: sevenDtdInput } : {}),
  });
  return { output: asFunctionCallOutput(call, output) };
};

const unknownToolHandler: ToolCallHandler = ({ call }) => ({
  output: asFunctionCallOutput(
    call,
    JSON.stringify({ errors: [{ code: "unknown_tool", message: call.name }] })
  ),
});

async function executeCall(
  call: ResponseFunctionCall,
  fallbackQuery: string,
  options: ExecuteCallOptions
): Promise<ExecuteCallResult> {
  const resolvedInput = resolveFunctionCallInput(call);
  debugLog("[tool debug] execute function_call", {
    rawFunctionCall: call,
    name: call.name,
    callId: call.call_id ?? null,
    inputSource: resolvedInput.source,
    inputPreview: (resolvedInput.payload ?? "").slice(0, 300),
  });
  const staticHandler = staticToolHandlers[call.name];
  if (staticHandler) {
    return staticHandler({ call, resolvedInput, fallbackQuery, options });
  }
  if (isSevenDtdToolName(call.name)) {
    return sevenDtdHandler({ call, resolvedInput, fallbackQuery, options });
  }
  return unknownToolHandler({ call, resolvedInput, fallbackQuery, options });
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
    "tool.enabledTools": extractEnabledToolNames(tools),
  });

  const forcedRetryPlan = buildForcedRetryPlan({
    baseInstructions: instructions,
    forceWebResearch,
    forceCurrentTime,
    forceAssistantProfile,
    hasWebResearchCall: hasFunctionCall(response, webResearchDigestTool.name),
    hasCurrentTimeCall: hasFunctionCall(response, currentTimeTool.name),
    hasAssistantProfileCall: hasFunctionCall(response, assistantProfileTool.name),
  });
  if (forcedRetryPlan.mustRetry) {
    debugRequestSummary({
      stage: "forced_retry",
      input: initialInput,
      instructions: forcedRetryPlan.strictInstructions,
      tools,
      maxOutputTokens: 700,
      temperature: 0.1,
      timeoutMs,
    });
    response = await createResponse(lmConfig, initialInput, {
      temperature: 0.1,
      maxOutputTokens: 700,
      instructions: forcedRetryPlan.strictInstructions,
      timeoutMs,
      tools,
    });
    debugLog("[tool debug] forced tool retry response", {
      responseId: response.id ?? null,
      outputTypes: (response.output ?? []).map((item) => item.type),
      mustRetryForWebResearch: forcedRetryPlan.mustRetryForWebResearch,
      mustRetryForCurrentTime: forcedRetryPlan.mustRetryForCurrentTime,
      mustRetryForAssistantProfile: forcedRetryPlan.mustRetryForAssistantProfile,
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
