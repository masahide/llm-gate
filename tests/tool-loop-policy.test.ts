import { describe, expect, test } from "vitest";
import {
  buildAssistantInstructions,
  needsCurrentTime,
  needsWebResearch,
  normalizeWebResearchParams,
} from "../src/discord/tool-loop-policy.js";
import type { WebResearchDigestParams } from "../src/tools/web-research-digest.js";

describe("tool-loop-policy", () => {
  test("needsWebResearch detects time-sensitive topics", () => {
    expect(needsWebResearch("明日の天気は？")).toBe(true);
    expect(needsWebResearch("衆議院選挙のニュースを教えて")).toBe(true);
    expect(needsWebResearch("こんにちは")).toBe(false);
  });

  test("needsCurrentTime detects time questions", () => {
    expect(needsCurrentTime("今何時？")).toBe(true);
    expect(needsCurrentTime("current time please")).toBe(true);
    expect(needsCurrentTime("ニュースを要約して")).toBe(false);
  });

  test("buildAssistantInstructions includes required directives", () => {
    const base = buildAssistantInstructions({
      assistantName: "suzume",
      today: "2026-02-07",
      forceWebResearch: false,
      forceCurrentTime: false,
    });
    expect(base).toContain("suzume");
    expect(base).toContain("2026-02-07");
    expect(base).toContain("24-hour format");
    expect(base).not.toContain("Call web_research_digest at least once");

    const forced = buildAssistantInstructions({
      assistantName: "suzume",
      today: "2026-02-07",
      forceWebResearch: true,
      forceCurrentTime: true,
    });
    expect(forced).toContain("Call web_research_digest at least once");
    expect(forced).toContain("Call current_time at least once");
    expect(forced).toContain("Do not send an empty input to web_research_digest");
  });

  test("normalizeWebResearchParams falls back to user query when tool input query is empty", () => {
    const parsed: WebResearchDigestParams = {
      query: "",
      maxResults: 3,
      maxPages: 2,
      focus: "",
    };
    const normalized = normalizeWebResearchParams(parsed, "  日本のAIニュース  ");
    expect(normalized.query).toBe("日本のAIニュース");
    expect(normalized.maxResults).toBe(3);
    expect(normalized.maxPages).toBe(2);
  });
});
