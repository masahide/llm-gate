import { describe, expect, test } from "vitest";
import {
  buildDebugRequestSummaryPayload,
  formatJstNow,
  resolveLmTimeoutMsFromEnv,
} from "../src/discord/tool-loop-debug.js";

describe("tool-loop-debug", () => {
  test("resolveLmTimeoutMsFromEnv uses default when value is invalid", () => {
    expect(resolveLmTimeoutMsFromEnv(undefined)).toBe(90000);
    expect(resolveLmTimeoutMsFromEnv("abc")).toBe(90000);
    expect(resolveLmTimeoutMsFromEnv("999")).toBe(90000);
  });

  test("resolveLmTimeoutMsFromEnv accepts value >= 1000", () => {
    expect(resolveLmTimeoutMsFromEnv("1000")).toBe(1000);
    expect(resolveLmTimeoutMsFromEnv("2500.9")).toBe(2500);
  });

  test("formatJstNow returns JST date-time fields", () => {
    const jst = formatJstNow(new Date("2026-02-08T04:49:20.000Z"));
    expect(jst.todayJst).toBe("2026-02-08");
    expect(jst.nowJst.startsWith("2026-02-08 ")).toBe(true);
    expect(jst.weekdayJst.length).toBeGreaterThan(0);
  });

  test("buildDebugRequestSummaryPayload returns expected shape", () => {
    const payload = buildDebugRequestSummaryPayload({
      stage: "initial",
      input: "hello",
      instructions: "be concise",
      tools: [
        {
          type: "function",
          name: "current_time",
          description: "time",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
      maxOutputTokens: 700,
      temperature: 0.2,
      timeoutMs: 120000,
    });
    expect(payload.stage).toBe("initial");
    expect(payload.inputShape).toBe("string");
    expect(payload.toolsCount).toBe(1);
    expect(payload.instructionsChars).toBeGreaterThan(0);
  });
});
