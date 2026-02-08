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

describe("seven-dtd tools", () => {
  test("read-only tools call client and return success JSON", async () => {
    const client = createClientMock();
    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_logs",
      rawInput: JSON.stringify({ lines: 20 }),
      writeEnabled: false,
      client,
    });

    expect(client.getLogs).toHaveBeenCalledWith({ lines: 20 });
    const parsed = JSON.parse(output) as { ok: boolean; data: { lines: string[] } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.lines).toEqual(["a", "b"]);
  });

  test("write tools return disabled error when feature flag is off", async () => {
    const client = createClientMock();
    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_restart",
      rawInput: "{}",
      writeEnabled: false,
      client,
    });

    expect(client.restart).not.toHaveBeenCalled();
    const parsed = JSON.parse(output) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("seven_dtd_write_disabled");
  });

  test("write tools call API when feature flag is on", async () => {
    const client = createClientMock();
    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_restart",
      rawInput: "{}",
      writeEnabled: true,
      client,
    });

    expect(client.restart).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(output) as { ok: boolean; data: { accepted: boolean } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.accepted).toBe(true);
  });

  test("exec command validates command input", async () => {
    const client = createClientMock();
    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_exec_command",
      rawInput: JSON.stringify({}),
      writeEnabled: true,
      client,
    });

    expect(client.execCommand).not.toHaveBeenCalled();
    const parsed = JSON.parse(output) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("seven_dtd_invalid_params");
  });

  test("missing token-like API errors are returned as tool errors", async () => {
    const client = createClientMock();
    client.getStatus.mockRejectedValueOnce(new Error("seven_dtd_missing_token"));

    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_status",
      rawInput: "{}",
      writeEnabled: false,
      client,
    });

    const parsed = JSON.parse(output) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("seven_dtd_api_error");
    expect(parsed.error.message).toContain("seven_dtd_missing_token");
  });

  test("HTTP error from 7dtd API is returned as JSON failure", async () => {
    const client = createClientMock();
    client.getStatus.mockRejectedValueOnce(new Error("seven_dtd_http_error:503:upstream down"));

    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_status",
      rawInput: "{}",
      writeEnabled: false,
      client,
    });

    const parsed = JSON.parse(output) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("seven_dtd_api_error");
    expect(parsed.error.message).toContain("seven_dtd_http_error:503");
  });

  test("timeout from 7dtd API is returned as JSON failure", async () => {
    const client = createClientMock();
    client.getStatus.mockRejectedValueOnce(new Error("seven_dtd_timeout"));

    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_status",
      rawInput: "{}",
      writeEnabled: false,
      client,
    });

    const parsed = JSON.parse(output) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("seven_dtd_api_error");
    expect(parsed.error.message).toContain("seven_dtd_timeout");
  });

  test("non-JSON body response is still wrapped as success data", async () => {
    const client = createClientMock();
    client.getStatus.mockResolvedValueOnce({ ok: true, text: "plain body" });

    const output = await runSevenDtdToolCall({
      toolName: "seven_dtd_get_status",
      rawInput: "{}",
      writeEnabled: false,
      client,
    });

    const parsed = JSON.parse(output) as {
      ok: boolean;
      data: { ok: boolean; text: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.ok).toBe(true);
    expect(parsed.data.text).toBe("plain body");
  });
});
