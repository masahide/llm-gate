import { describe, expect, test } from "vitest";
import {
  buildHttpErrorMessage,
  extractErrorCauseInfo,
  normalizeRequestError,
  parseSuccessResponseBody,
} from "../src/seven-dtd/client-core.js";

describe("seven-dtd client core", () => {
  test("buildHttpErrorMessage redacts token and trims body", () => {
    const longBody = `token leaked token ${"x".repeat(400)}`;
    const message = buildHttpErrorMessage(500, longBody, "token");
    expect(message).toContain("seven_dtd_http_error:500:");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("token");
    expect(message.length).toBeLessThan(350);
  });

  test("parseSuccessResponseBody returns parsed JSON for json content type", async () => {
    const response = new Response(JSON.stringify({ ok: true, value: 1 }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    await expect(parseSuccessResponseBody(response)).resolves.toEqual({ ok: true, value: 1 });
  });

  test("parseSuccessResponseBody throws invalid_json for broken JSON body", async () => {
    const response = new Response("{bad json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(parseSuccessResponseBody(response)).rejects.toThrow("seven_dtd_invalid_json");
  });

  test("parseSuccessResponseBody returns text wrapper for non-JSON content", async () => {
    const response = new Response("plain text body", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    await expect(parseSuccessResponseBody(response)).resolves.toEqual({
      ok: true,
      text: "plain text body",
    });
  });

  test("normalizeRequestError keeps known seven_dtd error messages", () => {
    const error = new Error("seven_dtd_http_error:503:upstream down");
    const normalized = normalizeRequestError(error);
    expect(normalized.message).toBe("seven_dtd_http_error:503:upstream down");
  });

  test("normalizeRequestError maps unknown error to network error with cause code", () => {
    const error = new TypeError("fetch failed");
    (error as TypeError & { cause?: unknown }).cause = {
      name: "Error",
      code: "ECONNREFUSED",
    };
    const normalized = normalizeRequestError(error);
    expect(normalized.message).toBe("seven_dtd_network_error:ECONNREFUSED");
  });

  test("extractErrorCauseInfo returns empty values for missing cause", () => {
    const info = extractErrorCauseInfo(new Error("x"));
    expect(info).toEqual({ name: "", code: "" });
  });
});
