export function extractErrorCauseInfo(error: Error): { name: string; code: string } {
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") {
    return { name: "", code: "" };
  }
  const named = cause as { name?: unknown; code?: unknown };
  return {
    name: typeof named.name === "string" ? named.name : "",
    code: typeof named.code === "string" ? named.code : "",
  };
}

export function buildHttpErrorMessage(status: number, body: string, token: string): string {
  const trimmed = body.slice(0, 300);
  const redacted = token ? trimmed.split(token).join("[REDACTED]") : trimmed;
  return `seven_dtd_http_error:${status}:${redacted}`;
}

export async function parseSuccessResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new Error("seven_dtd_invalid_json");
    }
  }
  return { ok: true, text: await response.text() };
}

export function normalizeRequestError(error: unknown): Error {
  const rawError = error instanceof Error ? error : new Error(String(error));
  if (rawError.message.startsWith("seven_dtd_")) {
    return rawError;
  }
  const cause = extractErrorCauseInfo(rawError);
  return new Error(
    `seven_dtd_network_error:${cause.code || cause.name || rawError.message || "fetch_failed"}`
  );
}
