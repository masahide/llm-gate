import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSevenDtdOpsClientFromEnv } from "../src/seven-dtd/client.js";

describe("seven-dtd client circuit breaker", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SEVEN_DTD_OPS_BASE_URL: "https://example.test",
      SEVEN_DTD_OPS_TOKEN: "token",
      SEVEN_DTD_OPS_TIMEOUT_MS: "10000",
      SEVEN_DTD_CB_FAILURE_THRESHOLD: "1",
      SEVEN_DTD_CB_OPEN_MS: "60000",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test("does not call fetch while breaker is open", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("upstream down", {
          status: 503,
          headers: { "content-type": "text/plain" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const client = createSevenDtdOpsClientFromEnv();
    await expect(client.getStatus()).rejects.toThrow("seven_dtd_http_error");
    await expect(client.getStatus()).rejects.toThrow("seven_dtd_circuit_open");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
