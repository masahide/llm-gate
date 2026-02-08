import type { RequestContext } from "../observability/request-context.js";

export type ToolSuccess = {
  ok: true;
  data: unknown;
  meta: {
    requestId: string;
    durationMs: number;
  };
};

export type ToolFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
    durationMs: number;
  };
};

function requestIdOrDefault(ctx?: RequestContext): string {
  return ctx?.requestId ?? "";
}

function durationMsOrNow(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function buildToolSuccessJson(
  data: unknown,
  options: { startedAt: number; requestContext?: RequestContext }
): string {
  const payload: ToolSuccess = {
    ok: true,
    data,
    meta: {
      requestId: requestIdOrDefault(options.requestContext),
      durationMs: durationMsOrNow(options.startedAt),
    },
  };
  return JSON.stringify(payload);
}

export function buildToolErrorJson(
  code: string,
  message: string,
  options: { startedAt: number; requestContext?: RequestContext; details?: unknown }
): string {
  const payload: ToolFailure = {
    ok: false,
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
    meta: {
      requestId: requestIdOrDefault(options.requestContext),
      durationMs: durationMsOrNow(options.startedAt),
    },
  };
  return JSON.stringify(payload);
}
