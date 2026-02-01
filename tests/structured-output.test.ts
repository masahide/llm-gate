import { describe, expect, test } from "vitest";
import { parseStructuredText } from "../src/structured-output.js";

describe("parseStructuredText", () => {
  test("valid JSON produces structured output", () => {
    const json = JSON.stringify({
      summary: "今日は構造化出力のデモを通して新しいフォーマットを学びました。",
      tone: "calm",
      actions: ["設定ファイルを整える", "テストを実行する"],
    });

    const result = parseStructuredText(json);
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("parseStructuredText: expected success but got failure");
    }
    expect(result).toMatchObject({
      success: true,
      data: { tone: "calm" },
    });
    expect(result.data.actions.length).toBe(2);
  });

  test("invalid JSON produces an error", () => {
    const result = parseStructuredText("{ not valid JSON }");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON parse failed");
    }
  });

  test("schema violations are reported", () => {
    const json = JSON.stringify({
      summary: "短い",
      tone: "passionate",
      actions: ["too short"],
    });

    const result = parseStructuredText(json);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("schema validation failed");
      expect(Array.isArray(result.issues)).toBe(true);
    }
  });
});
