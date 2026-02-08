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

  test("classifies fetch-level failures as seven_dtd_network_error", async () => {
    const networkError = new TypeError("fetch failed");
    (networkError as TypeError & { cause?: unknown }).cause = {
      name: "Error",
      code: "ECONNREFUSED",
    };
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(networkError);

    const client = createSevenDtdOpsClientFromEnv();
    await expect(client.getStatus()).rejects.toThrow("seven_dtd_network_error:ECONNREFUSED");
  });

  test("uses /server paths and GET methods for 7dtd ops api", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createSevenDtdOpsClientFromEnv();
    await client.getStatus();
    await client.getLogs({ lines: 77 });
    await client.getSummary({ includePositions: false, timeoutSeconds: 5 });
    await client.start();
    await client.stop();
    await client.restart();
    await client.execCommand("version");

    const requests = fetchMock.mock.calls.map((call) => {
      const url = call[0] as string;
      const init = call[1] as { method?: string } | undefined;
      return { url, method: init?.method ?? "GET" };
    });
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://example.test/server/status", method: "GET" }),
        expect.objectContaining({
          url: "https://example.test/server/logs?lines=77",
          method: "GET",
        }),
        expect.objectContaining({
          url: expect.stringContaining("https://example.test/server/summary?"),
          method: "GET",
        }),
        expect.objectContaining({ url: "https://example.test/server/start", method: "GET" }),
        expect.objectContaining({ url: "https://example.test/server/stop", method: "GET" }),
        expect.objectContaining({ url: "https://example.test/server/restart", method: "GET" }),
        expect.objectContaining({
          url: "https://example.test/server/command?command=version",
          method: "GET",
        }),
      ])
    );
  });
});
