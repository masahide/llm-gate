import type { ResponseFunctionCall, ResponseInput, ResponsesResponse } from "../lmstudio.js";
import type { LmToolDefinition } from "../lmstudio.js";
import {
  parseWebResearchDigestParams,
  type WebResearchDigestOutput,
  type WebResearchDigestParams,
} from "../tools/web-research-digest.js";

const MAX_INPUT_IMAGE_URLS = 4;

export function buildInitialResponseInput(
  input: string | { text: string; imageUrls?: string[] }
): ResponseInput {
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

export function collectFunctionCalls(response: ResponsesResponse): ResponseFunctionCall[] {
  const out = response.output ?? [];
  return out.filter((item): item is ResponseFunctionCall => item.type === "function_call");
}

export function hasFunctionCall(response: ResponsesResponse, toolName: string): boolean {
  return collectFunctionCalls(response).some((call) => call.name === toolName);
}

function hasNonBlankValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveFunctionCallInput(call: ResponseFunctionCall): {
  payload: string | undefined;
  source: "input" | "arguments" | "none";
} {
  if (hasNonBlankValue(call.input)) {
    return { payload: call.input, source: "input" };
  }
  if (hasNonBlankValue(call.arguments)) {
    return { payload: call.arguments, source: "arguments" };
  }
  return { payload: undefined, source: "none" };
}

export function appendCitationsIfNeeded(text: string, citationUrls: string[]): string {
  if (citationUrls.length === 0) return text;
  if (/https?:\/\/\S+/i.test(text)) return text;

  const uniqueUrls = [...new Set(citationUrls)].slice(0, 5);
  if (uniqueUrls.length === 0) return text;
  const sources = uniqueUrls.map((url) => `- ${url}`).join("\n");
  return `${text}\n\n参照元:\n${sources}`;
}

export function extractEnabledToolNames(tools: LmToolDefinition[]): string[] {
  return tools.map((tool) => tool.name).filter((name) => name.length > 0);
}

export function buildForcedRetryPlan(params: {
  baseInstructions: string;
  forceWebResearch: boolean;
  forceCurrentTime: boolean;
  forceAssistantProfile: boolean;
  hasWebResearchCall: boolean;
  hasCurrentTimeCall: boolean;
  hasAssistantProfileCall: boolean;
}): {
  mustRetry: boolean;
  mustRetryForWebResearch: boolean;
  mustRetryForCurrentTime: boolean;
  mustRetryForAssistantProfile: boolean;
  strictInstructions: string;
} {
  const mustRetryForWebResearch = params.forceWebResearch && !params.hasWebResearchCall;
  const mustRetryForCurrentTime = params.forceCurrentTime && !params.hasCurrentTimeCall;
  const mustRetryForAssistantProfile =
    params.forceAssistantProfile && !params.hasAssistantProfileCall;
  const mustRetry =
    mustRetryForWebResearch || mustRetryForCurrentTime || mustRetryForAssistantProfile;
  const lines = [params.baseInstructions];
  if (mustRetryForWebResearch) {
    lines.push("IMPORTANT: Do not answer directly before calling web_research_digest.");
  }
  if (mustRetryForCurrentTime) {
    lines.push("IMPORTANT: Do not answer directly before calling current_time.");
  }
  if (mustRetryForAssistantProfile) {
    lines.push("IMPORTANT: Do not answer directly before calling assistant_profile.");
  }
  return {
    mustRetry,
    mustRetryForWebResearch,
    mustRetryForCurrentTime,
    mustRetryForAssistantProfile,
    strictInstructions: lines.join("\n"),
  };
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

export function normalizeWebResearchDigestCall(params: {
  rawInput?: string;
  fallbackQuery: string;
}): {
  parsed: WebResearchDigestParams;
  params: WebResearchDigestParams;
  usedFallbackQuery: boolean;
} {
  const parsed = parseWebResearchDigestParams(params.rawInput);
  const normalized = normalizeWebResearchParams(parsed, params.fallbackQuery);
  return {
    parsed,
    params: normalized,
    usedFallbackQuery: !parsed.query,
  };
}

export function extractWebCitationUrls(output: WebResearchDigestOutput | unknown): string[] {
  const citations = (output as { citations?: unknown })?.citations;
  if (!Array.isArray(citations)) return [];
  return citations
    .map((citation) => (citation as { url?: unknown })?.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}
