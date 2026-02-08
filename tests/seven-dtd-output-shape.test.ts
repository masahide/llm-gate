import { describe, expect, test, vi } from "vitest";
import { runSevenDtdToolCall } from "../src/tools/seven-dtd-ops.js";

function createClientMock() {
  return {
    getStatus: vi.fn().mockResolvedValue({ state: "running" }),
    getSummary: vi.fn().mockResolvedValue({ players: 3 }),
    getLogs: vi.fn().mockResolvedValue({ lines: ["a", "b"] }),
    start: vi.fn().mockResolvedValue({ accepted: true }),
    stop: vi.fn().mockResolvedValue({ accepted: true }),
    restart: vi.fn().mockResolvedValue({ accepted: true }),
    execCommand: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe("seven-dtd output shape", () => {
  test("success response keeps common top-level shape", async () => {
    const client = createClientMock();
    const out = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_status",
      writeEnabled: false,
      client,
      requestContext: {
        requestId: "req-1",
        guildId: "g1",
        effectiveChannelId: "c1",
        threadId: "",
        messageId: "m1",
        persona: "seven_dtd_ops",
        enabledTools: [],
      },
    });

    const parsed = JSON.parse(out) as {
      ok: boolean;
      data: { state: string };
      meta: { requestId: string; durationMs: number };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.state).toBe("running");
    expect(parsed.meta.requestId).toBe("req-1");
    expect(parsed.meta.durationMs).toBeTypeOf("number");
  });

  test("failure response keeps common top-level shape and seven_dtd_* code", async () => {
    const client = createClientMock();
    client.getStatus.mockRejectedValueOnce(new Error("seven_dtd_timeout"));

    const out = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_status",
      writeEnabled: false,
      client,
    });

    const parsed = JSON.parse(out) as {
      ok: boolean;
      error: { code: string; message: string };
      meta: { requestId: string; durationMs: number };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("seven_dtd_timeout");
    expect(parsed.error.message).toContain("seven_dtd_timeout");
    expect(parsed.meta.durationMs).toBeTypeOf("number");
  });
});
