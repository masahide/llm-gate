import { describe, expect, test } from "vitest";
import {
  buildLmErrorReply,
  buildThreadName,
  extractBodyFromContent,
  splitReply,
} from "../src/discord/message-utils.js";

describe("discord message utils", () => {
  test("extractBodyFromContent removes bot mention and normalizes spaces", () => {
    const out = extractBodyFromContent("  <@12345>   こんばんは   ", "12345");
    expect(out).toBe("こんばんは");
  });

  test("buildThreadName removes raw mentions and truncates name", () => {
    const out = buildThreadName({
      assistantName: "suzume",
      text: "<@123> <@&927391309688369185> こんばんは <#123456>",
    });
    expect(out.startsWith("suzume: ")).toBe(true);
    expect(out).not.toContain("<@");
    expect(out).not.toContain("<#");
    expect(out.length).toBeLessThanOrEqual(90);
  });

  test("splitReply chunks long text at 1800 chars", () => {
    const text = "a".repeat(3700);
    const chunks = splitReply(text);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(1800);
    expect(chunks[1]).toHaveLength(1800);
    expect(chunks[2]).toHaveLength(100);
  });

  test("buildLmErrorReply maps timeout and connectivity errors", () => {
    expect(buildLmErrorReply(new Error("LM Studio request timed out after 30000ms"))).toContain(
      "タイムアウト"
    );
    expect(buildLmErrorReply(new Error("fetch failed"))).toContain("接続");
    expect(buildLmErrorReply(new Error("HTTP 500"))).toContain("LLM サーバー");
    expect(buildLmErrorReply(new Error("something else"))).toContain("エラー");
  });
});
