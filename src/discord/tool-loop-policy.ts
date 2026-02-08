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

const WEB_RESEARCH_PATTERNS: RegExp[] = [
  /天気|天候|気温|降水|台風|weather|forecast/,
  /ニュース|報道|速報|最新|today|tomorrow|yesterday|今日|明日|昨日/,
  /選挙|election|為替|株価|金利|価格|相場/,
];

const CURRENT_TIME_PATTERNS: RegExp[] = [
  /何時|時刻|現在時刻|今の時間|現在の時間|いま何時/,
  /\btime\b|\bcurrent time\b|\bwhat time\b|\bnow\b/,
];

const ASSISTANT_PROFILE_PATTERNS: RegExp[] = [
  /モデル名|モデルは|使用モデル|使ってるモデル|llm名|プロフィール|version|バージョン|起動時刻|稼働時間|uptime/,
  /\bmodel name\b|\bwhich model\b|\bwhat model\b|\bprofile\b|\bversion\b|\buptime\b|\bstarted at\b/,
];

const DEFAULT_INSTRUCTION_LINES = [
  "Answer in concise and polite Japanese.",
  "You can use current_time, web_research_digest, and assistant_profile tools when needed.",
  "For any time-related answer, use Asia/Tokyo and 24-hour format.",
  "When calling web_research_digest, preserve the user's intent in the query.",
  "If the user did not specify a year, do not arbitrarily lock the query to an older year.",
  "Input can be either a single user question or a transcript formatted as 'user:'/'assistant:'. Prioritize full conversation context.",
] as const;

const SEVEN_DTD_GUARDRAIL_LINES = [
  "You are operating in a controlled 7 Days to Die server operations channel.",
  "Use seven_dtd_exec_command only for game-console inspection or player messaging.",
  "Prefer seven_dtd_get_status, seven_dtd_get_summary, and seven_dtd_get_logs for server questions.",
  "Allowed server commands for seven_dtd_exec_command are strictly: version, gettime (gt), listknownplayers (lkp), listplayers (lp), mem, say, sayplayer (pm), reply (re), saveworld (sa).",
  "Never use or suggest commands outside the allowed list.",
  "Command intent guide: version for game/mod compatibility, gt for in-game time, lp for online players, lkp for known players, mem for runtime health, say for broadcast, pm for private message, re for replying to last private message, sa for manual world save.",
  "Before maintenance workflow, prefer: lp -> say (if players are online) -> sa.",
  "Before pm, verify target identity with lp or lkp when ambiguous.",
  "Avoid duplicate or spammy messaging. Do not repeat the same command without a clear reason.",
  "Treat player identifiers and IP-related fields as sensitive and reveal only when necessary.",
  "If command output is unclear or empty, report uncertainty and propose the next safe check.",
  "When write tools are unavailable or disabled, explain that only read-only tools are currently allowed.",
  "Do not claim execution success unless tool output confirms success.",
] as const;

function matchesAnyPattern(inputText: string, patterns: RegExp[]): boolean {
  const normalized = inputText.toLowerCase();
  return patterns.some((pattern) => pattern.test(normalized));
}

const USER_LINE_PATTERN = /^user\s*:/i;
const USER_PREFIX_PATTERN = /^user\s*:\s*/i;
const SPEAKER_NAME_PREFIX_PATTERN = /^[^:]{1,40}:\s*/;

function isUserLine(line: string): boolean {
  return USER_LINE_PATTERN.test(line);
}

function stripUserLinePrefix(line: string): string {
  const afterUserPrefix = line.replace(USER_PREFIX_PATTERN, "");
  return afterUserPrefix.replace(SPEAKER_NAME_PREFIX_PATTERN, "").trim();
}

export function extractLatestUserInput(inputText: string): string {
  const lines = inputText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const userLines = lines.filter(isUserLine);
  if (userLines.length === 0) return inputText.trim();

  const latestUserLine = userLines[userLines.length - 1] ?? "";
  return stripUserLinePrefix(latestUserLine);
}

export function needsWebResearch(inputText: string): boolean {
  return matchesAnyPattern(inputText, WEB_RESEARCH_PATTERNS);
}

export function needsCurrentTime(inputText: string): boolean {
  return matchesAnyPattern(inputText, CURRENT_TIME_PATTERNS);
}

export function needsAssistantProfile(inputText: string): boolean {
  return matchesAnyPattern(inputText, ASSISTANT_PROFILE_PATTERNS);
}

function buildForcedInstructionLines(params: BuildAssistantInstructionsParams): string[] {
  const lines: string[] = [];
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
  return lines;
}

export function buildAssistantInstructionsDefault(
  params: BuildAssistantInstructionsParams
): string {
  const lines = [
    `You are a friendly assistant named ${params.assistantName}.`,
    `Current date and time in Japan Standard Time (JST, UTC+09:00): ${params.nowJst}.`,
    `Today's date in JST is ${params.todayJst} (${params.weekdayJst}). Use this as the reference date for all temporal reasoning.`,
    ...DEFAULT_INSTRUCTION_LINES,
    ...buildForcedInstructionLines(params),
  ];
  return lines.join("\n");
}

export function buildAssistantInstructionsSevenDtdOps(
  params: BuildAssistantInstructionsParams
): string {
  const lines = [buildAssistantInstructionsDefault(params), ...SEVEN_DTD_GUARDRAIL_LINES];
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
