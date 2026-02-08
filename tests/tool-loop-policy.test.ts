import { describe, expect, test } from "vitest";
import {
  buildAssistantInstructions,
  extractLatestUserInput,
  needsAssistantProfile,
  needsCurrentTime,
  needsWebResearch,
} from "../src/discord/tool-loop-policy.js";

describe("tool-loop-policy", () => {
  test("needsWebResearch detects time-sensitive topics", () => {
    expect(needsWebResearch("明日の天気は？")).toBe(true);
    expect(needsWebResearch("衆議院選挙のニュースを教えて")).toBe(true);
    expect(needsWebResearch("WEATHER FORECAST today")).toBe(true);
    expect(needsWebResearch("こんにちは")).toBe(false);
  });

  test("needsCurrentTime detects time questions", () => {
    expect(needsCurrentTime("今何時？")).toBe(true);
    expect(needsCurrentTime("current time please")).toBe(true);
    expect(needsCurrentTime("ニュースを要約して")).toBe(false);
  });

  test("needsAssistantProfile detects profile questions", () => {
    expect(needsAssistantProfile("あなたのモデル名は？")).toBe(true);
    expect(needsAssistantProfile("version と uptime を教えて")).toBe(true);
    expect(needsAssistantProfile("WHICH MODEL are you using?")).toBe(true);
    expect(needsAssistantProfile("今日の天気は？")).toBe(false);
  });

  test("extractLatestUserInput uses only latest user turn from transcript", () => {
    const transcript = [
      "user: hamu: あなたのモデル名は？",
      "assistant: 現在使用しているモデルは ... です。",
      "user: hamu: 今日の天気は？",
    ].join("\n");
    expect(extractLatestUserInput(transcript)).toBe("今日の天気は？");
  });

  test("extractLatestUserInput handles spacing and case variations in user prefix", () => {
    const transcript = [
      "USER: hamu: 最初の質問",
      "assistant: 了解しました",
      "user : hamu: 池袋の天気は？",
    ].join("\n");
    expect(extractLatestUserInput(transcript)).toBe("池袋の天気は？");
  });

  test("buildAssistantInstructions includes required directives", () => {
    const base = buildAssistantInstructions({
      assistantName: "suzume",
      todayJst: "2026-02-07",
      weekdayJst: "Saturday",
      nowJst: "2026-02-07 23:15:42",
      forceWebResearch: false,
      forceCurrentTime: false,
      forceAssistantProfile: false,
    });
    expect(base).toContain("suzume");
    expect(base).toContain("2026-02-07");
    expect(base).toContain("(Saturday)");
    expect(base).toContain("Japan Standard Time");
    expect(base).toContain("23:15:42");
    expect(base).toContain("24-hour format");
    expect(base).not.toContain("Call web_research_digest at least once");

    const forced = buildAssistantInstructions({
      assistantName: "suzume",
      todayJst: "2026-02-07",
      weekdayJst: "Saturday",
      nowJst: "2026-02-07 23:15:42",
      forceWebResearch: true,
      forceCurrentTime: true,
      forceAssistantProfile: true,
    });
    expect(forced).toContain("Call web_research_digest at least once");
    expect(forced).toContain("Call current_time at least once");
    expect(forced).toContain("Call assistant_profile at least once");
    expect(forced).toContain("Do not send an empty input to web_research_digest");
  });

  test("buildAssistantInstructions includes 7dtd ops guardrails for seven_dtd_ops persona", () => {
    const sevenDtd = buildAssistantInstructions({
      assistantName: "suzume",
      todayJst: "2026-02-08",
      weekdayJst: "Sunday",
      nowJst: "2026-02-08 13:45:14",
      forceWebResearch: false,
      forceCurrentTime: false,
      forceAssistantProfile: false,
      persona: "seven_dtd_ops",
    });
    expect(sevenDtd).toContain("Allowed server commands for seven_dtd_exec_command are strictly:");
    expect(sevenDtd).toContain(
      "You can use current_time, web_research_digest, and assistant_profile tools when needed."
    );
    expect(sevenDtd).toContain(
      "Before maintenance workflow, prefer: lp -> say (if players are online) -> sa."
    );
    expect(sevenDtd).toContain(
      "Do not claim execution success unless tool output confirms success."
    );
  });
});
