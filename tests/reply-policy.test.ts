import { describe, expect, test } from "vitest";
import { buildReply } from "../src/discord/reply-policy.js";

describe("buildReply", () => {
  test("returns help message with mention label", () => {
    const out = buildReply("help", "<@123>");
    expect(out).toContain("使い方");
    expect(out).toContain("<@123> こんにちは");
  });

  test("returns canned responses", () => {
    expect(buildReply("ping", "<@123>")).toBe("pong");
    expect(buildReply("こんにちは", "<@123>")).toContain("こんにちは");
    expect(buildReply("おはよう", "<@123>")).toContain("おはようございます");
    expect(buildReply("こんばんは", "<@123>")).toContain("こんばんは");
  });

  test("falls back to paraphrase for unknown input", () => {
    const out = buildReply("任意の入力", "<@123>");
    expect(out).toBe("なるほど。任意の入力 ということですね");
  });
});
