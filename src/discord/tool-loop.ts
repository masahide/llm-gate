import { cfg } from "../basic.js";
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
  return process.env.DEBUG_WEB_RESEARCH === "true" || process.env.DEBUG_SUZUME === "true";
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

function needsWebResearch(inputText: string): boolean {
  const t = inputText.toLowerCase();
  const patterns = [
    /天気|天候|気温|降水|台風|weather|forecast/,
    /ニュース|報道|速報|最新|today|tomorrow|yesterday|今日|明日|昨日/,
    /選挙|election|為替|株価|金利|価格|相場/,
  ];
  return patterns.some((pattern) => pattern.test(t));
}

function buildAssistantInstructions(forceWebResearch: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const base = [
    "あなたは親しみやすいアシスタント Suzume です。日本語で簡潔かつ礼儀正しく答えてください。",
    `今日は ${today} です。日付や年号はこの日付を基準に扱ってください。`,
    "必要な情報取得には current_time と web_research_digest を使えます。",
    "web_research_digest の query は、ユーザーの意図を保って作成してください。",
    "ユーザーが年を明示していない場合、年を勝手に古い年へ固定しないでください。",
    "入力は単発の質問か、'user:'/'assistant:' 形式の会話履歴です。履歴全体の文脈を優先して回答してください。",
  ];
  if (forceWebResearch) {
    base.push(
      "この質問は最新情報が必要です。最終回答の前に web_research_digest を少なくとも1回呼び出してください。",
      'web_research_digest の入力は空にせず、必ず {"query":"...","max_results":3,"max_pages":3} 形式の JSON を渡してください。'
    );
  }
  return base.join("\n");
}

function collectFunctionCalls(response: ResponsesResponse): ResponseFunctionCall[] {
  const out = response.output ?? [];
  return out.filter((item): item is ResponseFunctionCall => item.type === "function_call");
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
    const params = parsed.query
      ? parsed
      : {
          ...parsed,
          query: fallbackQuery.trim().slice(0, 300),
        };
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
  const tools = [currentTimeTool, webResearchDigestTool];
  const instructions = buildAssistantInstructions(forceWebResearch);

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
  });

  if (forceWebResearch && collectFunctionCalls(response).length === 0) {
    const strictInstructions = [
      instructions,
      "IMPORTANT: Do not answer directly before calling web_research_digest.",
    ].join("\n");
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
