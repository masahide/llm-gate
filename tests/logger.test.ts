import { describe, expect, test } from "vitest";
import { redactForLog, truncateForLog } from "../src/observability/logger.js";

describe("logger helpers", () => {
  test("redacts token and authorization headers", () => {
    process.env.SEVEN_DTD_OPS_TOKEN = "secret-token";
    const input = {
      Authorization: "Bearer secret-token",
      nested: { token: "secret-token", text: "hello secret-token world" },
    };
    const out = redactForLog(input) as {
      Authorization: string;
      nested: { token: string; text: string };
    };

    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.nested.token).toBe("[REDACTED]");
    expect(out.nested.text).not.toContain("secret-token");
  });

  test("truncate limits long text", () => {
    const out = truncateForLog("a".repeat(50), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toContain("[truncated]");
  });
});
