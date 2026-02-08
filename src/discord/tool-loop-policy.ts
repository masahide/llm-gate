import type { WebResearchDigestParams } from "../tools/web-research-digest.js";

type BuildAssistantInstructionsParams = {
  assistantName: string;
  todayJst: string;
  weekdayJst: string;
  nowJst: string;
  forceWebResearch: boolean;
  forceCurrentTime: boolean;
  forceAssistantProfile: boolean;
};

export type AssistantPersona = "default" | "seven_dtd_ops";

export function extractLatestUserInput(inputText: string): string {
  const lines = inputText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const userLines = lines.filter((line) => line.startsWith("user:"));
  if (userLines.length === 0) return inputText.trim();

  const latestUserLine = userLines[userLines.length - 1] ?? "";
  const afterPrefix = latestUserLine.replace(/^user:\s*/i, "");
  return afterPrefix.replace(/^[^:]{1,40}:\s*/, "").trim();
}

export function needsWebResearch(inputText: string): boolean {
  const t = inputText.toLowerCase();
  const patterns = [
    /天気|天候|気温|降水|台風|weather|forecast/,
    /ニュース|報道|速報|最新|today|tomorrow|yesterday|今日|明日|昨日/,
    /選挙|election|為替|株価|金利|価格|相場/,
  ];
  return patterns.some((pattern) => pattern.test(t));
}

export function needsCurrentTime(inputText: string): boolean {
  const t = inputText.toLowerCase();
  const patterns = [
    /何時|時刻|現在時刻|今の時間|現在の時間|いま何時/,
    /\btime\b|\bcurrent time\b|\bwhat time\b|\bnow\b/,
  ];
  return patterns.some((pattern) => pattern.test(t));
}

export function needsAssistantProfile(inputText: string): boolean {
  const t = inputText.toLowerCase();
  const patterns = [
    /モデル名|モデルは|使用モデル|使ってるモデル|llm名|プロフィール|version|バージョン|起動時刻|稼働時間|uptime/,
    /\bmodel name\b|\bwhich model\b|\bwhat model\b|\bprofile\b|\bversion\b|\buptime\b|\bstarted at\b/,
  ];
  return patterns.some((pattern) => pattern.test(t));
}

export function buildAssistantInstructionsDefault(
  params: BuildAssistantInstructionsParams
): string {
  const lines = [
    `You are a friendly assistant named ${params.assistantName}.`,
    "Answer in concise and polite Japanese.",
    `Current date and time in Japan Standard Time (JST, UTC+09:00): ${params.nowJst}.`,
    `Today's date in JST is ${params.todayJst} (${params.weekdayJst}). Use this as the reference date for all temporal reasoning.`,
    "You can use current_time, web_research_digest, and assistant_profile tools when needed.",
    "For any time-related answer, use Asia/Tokyo and 24-hour format.",
    "When calling web_research_digest, preserve the user's intent in the query.",
    "If the user did not specify a year, do not arbitrarily lock the query to an older year.",
    "Input can be either a single user question or a transcript formatted as 'user:'/'assistant:'. Prioritize full conversation context.",
  ];
  if (params.forceCurrentTime) {
    lines.push(
      "This question asks for current time. Call current_time at least once before the final answer.",
      'If timezone is omitted, call current_time with {"timezone":"Asia/Tokyo"}.'
    );
  }
  if (params.forceAssistantProfile) {
    lines.push(
      "This question asks about assistant profile. Call assistant_profile at least once before the final answer."
    );
  }
  if (params.forceWebResearch) {
    lines.push(
      "This question requires up-to-date information. Call web_research_digest at least once before the final answer.",
      'Do not send an empty input to web_research_digest. Always pass JSON like {"query":"...","max_results":3,"max_pages":3}.'
    );
  }
  return lines.join("\n");
}

export function buildAssistantInstructionsSevenDtdOps(
  params: BuildAssistantInstructionsParams
): string {
  const lines = [
    buildAssistantInstructionsDefault(params),
    "You are operating in a controlled 7 Days to Die server operations channel.",
    "Prefer seven_dtd_get_status, seven_dtd_get_summary, and seven_dtd_get_logs for server questions.",
    "When write tools are unavailable or disabled, explain that only read-only tools are currently allowed.",
    "Do not claim execution success unless tool output confirms success.",
  ];
  return lines.join("\n");
}

export function buildAssistantInstructions(
  params: BuildAssistantInstructionsParams & { persona?: AssistantPersona }
): string {
  if (params.persona === "seven_dtd_ops") {
    return buildAssistantInstructionsSevenDtdOps(params);
  }
  return buildAssistantInstructionsDefault(params);
}

export function normalizeWebResearchParams(
  parsed: WebResearchDigestParams,
  fallbackQuery: string
): WebResearchDigestParams {
  if (parsed.query) return parsed;
  return {
    ...parsed,
    query: fallbackQuery.trim().slice(0, 300),
  };
}
