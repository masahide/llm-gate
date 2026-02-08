import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSevenDtdOpsClientFromEnv } from "../src/seven-dtd/client.js";

describe("seven-dtd client", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SEVEN_DTD_OPS_BASE_URL: "https://example.test",
      SEVEN_DTD_OPS_TOKEN: "token",
      SEVEN_DTD_OPS_TIMEOUT_MS: "10000",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test("throws http error message when status is non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("upstream down", {
        status: 503,
        headers: { "content-type": "text/plain" },
      })
    );

    const client = createSevenDtdOpsClientFromEnv();
    await expect(client.getStatus()).rejects.toThrow("seven_dtd_http_error:503:upstream down");
  });

  test("redacts token from http error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("token leaked: token", {
        status: 500,
        headers: { "content-type": "text/plain" },
      })
    );

    const client = createSevenDtdOpsClientFromEnv();
    let message = "";
    try {
      await client.getStatus();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("seven_dtd_http_error:500:");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("token");
  });

  test("throws timeout error when fetch aborts", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

    const client = createSevenDtdOpsClientFromEnv();
    await expect(client.getStatus()).rejects.toThrow("seven_dtd_timeout");
  });

  test("returns text payload when content type is not json", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("plain body", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const client = createSevenDtdOpsClientFromEnv();
    await expect(client.getStatus()).resolves.toEqual({ ok: true, text: "plain body" });
  });
});
