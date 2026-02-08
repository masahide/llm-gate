import { describe, expect, test } from "vitest";
import {
  appendCitationsIfNeeded,
  buildForcedRetryPlan,
  buildInitialResponseInput,
  extractWebCitationUrls,
  extractEnabledToolNames,
  hasFunctionCall,
  normalizeWebResearchDigestCall,
  resolveFunctionCallInput,
} from "../src/discord/tool-loop-core.js";

describe("tool-loop-core", () => {
  test("resolveFunctionCallInput uses arguments when input is whitespace only", () => {
    const resolved = resolveFunctionCallInput({
      type: "function_call",
      name: "web_research_digest",
      call_id: "c1",
      input: "   ",
      arguments: '{"query":"tokyo weather"}',
    });
    expect(resolved.source).toBe("arguments");
    expect(resolved.payload).toBe('{"query":"tokyo weather"}');
  });

  test("appendCitationsIfNeeded appends up to 5 unique URLs only when text has no URL", () => {
    const out = appendCitationsIfNeeded("summary", [
      "https://a.example",
      "https://b.example",
      "https://c.example",
      "https://d.example",
      "https://e.example",
      "https://f.example",
      "https://a.example",
    ]);
    expect(out).toContain("参照元:");
    expect(out).toContain("https://a.example");
    expect(out).toContain("https://e.example");
    expect(out).not.toContain("https://f.example");
  });

  test("appendCitationsIfNeeded does not append when text already includes URL", () => {
    const out = appendCitationsIfNeeded("see https://a.example", ["https://b.example"]);
    expect(out).toBe("see https://a.example");
  });

  test("buildInitialResponseInput builds multimodal payload and limits images to 4", () => {
    const input = buildInitialResponseInput({
      text: "画像を見て",
      imageUrls: [
        "https://example.com/1.png",
        "https://example.com/2.png",
        "https://example.com/3.png",
        "https://example.com/4.png",
        "https://example.com/5.png",
      ],
    });

    expect(Array.isArray(input)).toBe(true);
    if (!Array.isArray(input)) return;
    const first = input[0];
    if (!first || !("role" in first) || first.role !== "user") return;
    const content = first.content as Array<{ type: string; image_url?: string }>;
    const imageItems = content.filter((item) => item.type === "input_image");
    expect(imageItems).toHaveLength(4);
  });

  test("hasFunctionCall detects target tool name", () => {
    expect(
      hasFunctionCall(
        {
          output: [{ type: "function_call", name: "current_time", call_id: "c1", input: "{}" }],
        },
        "current_time"
      )
    ).toBe(true);
    expect(
      hasFunctionCall(
        {
          output: [{ type: "function_call", name: "current_time", call_id: "c1", input: "{}" }],
        },
        "web_research_digest"
      )
    ).toBe(false);
  });

  test("extractEnabledToolNames returns only valid tool names", () => {
    const names = extractEnabledToolNames([
      {
        type: "function",
        name: "current_time",
        description: "time",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        type: "function",
        name: "web_research_digest",
        description: "web",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
    ]);
    expect(names).toEqual(["current_time", "web_research_digest"]);
  });

  test("buildForcedRetryPlan returns strict instructions when retry is required", () => {
    const plan = buildForcedRetryPlan({
      baseInstructions: "base",
      forceWebResearch: true,
      forceCurrentTime: true,
      forceAssistantProfile: true,
      hasWebResearchCall: false,
      hasCurrentTimeCall: false,
      hasAssistantProfileCall: false,
    });
    expect(plan.mustRetry).toBe(true);
    expect(plan.mustRetryForWebResearch).toBe(true);
    expect(plan.mustRetryForCurrentTime).toBe(true);
    expect(plan.mustRetryForAssistantProfile).toBe(true);
    expect(plan.strictInstructions).toContain(
      "Do not answer directly before calling web_research_digest."
    );
    expect(plan.strictInstructions).toContain(
      "Do not answer directly before calling current_time."
    );
    expect(plan.strictInstructions).toContain(
      "Do not answer directly before calling assistant_profile."
    );
  });

  test("buildForcedRetryPlan does not require retry when all forced tools already called", () => {
    const plan = buildForcedRetryPlan({
      baseInstructions: "base",
      forceWebResearch: true,
      forceCurrentTime: true,
      forceAssistantProfile: true,
      hasWebResearchCall: true,
      hasCurrentTimeCall: true,
      hasAssistantProfileCall: true,
    });
    expect(plan.mustRetry).toBe(false);
    expect(plan.strictInstructions).toBe("base");
  });

  test("normalizeWebResearchDigestCall falls back to user query when parsed query is empty", () => {
    const normalized = normalizeWebResearchDigestCall({
      rawInput: "{}",
      fallbackQuery: "  日本のAIニュース  ",
    });
    expect(normalized.usedFallbackQuery).toBe(true);
    expect(normalized.parsed.query).toBe("");
    expect(normalized.params.query).toBe("日本のAIニュース");
    expect(normalized.params.maxResults).toBe(5);
    expect(normalized.params.maxPages).toBe(3);
  });

  test("normalizeWebResearchDigestCall uses parsed query when provided", () => {
    const normalized = normalizeWebResearchDigestCall({
      rawInput: JSON.stringify({
        query: "  池袋 タカノフルーツパーラー 営業時間  ",
        max_results: 2,
        max_pages: 1,
      }),
      fallbackQuery: "ignored",
    });
    expect(normalized.usedFallbackQuery).toBe(false);
    expect(normalized.params.query).toBe("池袋 タカノフルーツパーラー 営業時間");
    expect(normalized.params.maxResults).toBe(2);
    expect(normalized.params.maxPages).toBe(1);
  });

  test("extractWebCitationUrls returns only non-empty string URLs", () => {
    const urls = extractWebCitationUrls({
      citations: [
        { id: "1", url: "https://a.example" },
        { id: "2", url: "" },
        { id: "3", url: 123 },
      ],
    });
    expect(urls).toEqual(["https://a.example"]);
  });
});
