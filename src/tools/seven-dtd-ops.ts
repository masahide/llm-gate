import type { SevenDtdOpsClient } from "../seven-dtd/client.js";
import type { RequestContext } from "../observability/request-context.js";
import { buildToolErrorJson, buildToolSuccessJson } from "./tool-output.js";

export const sevenDtdGetStatusTool = {
  type: "function" as const,
  name: "seven_dtd_get_status",
  description: "Get current 7 Days to Die server status.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export const sevenDtdGetSummaryTool = {
  type: "function" as const,
  name: "seven_dtd_get_summary",
  description: "Get aggregated 7 Days to Die server summary.",
  parameters: {
    type: "object",
    properties: {
      includePositions: {
        type: "boolean",
        description: "Include entity positions in the summary.",
      },
      maskIPs: {
        type: "boolean",
        description: "Mask player IP addresses in the summary.",
      },
      limitHostiles: {
        type: "number",
        description: "Maximum hostile entries to include (0-2000).",
      },
      timeoutSeconds: {
        type: "number",
        description: "Upstream timeout in seconds (1-15).",
      },
      verbose: {
        type: "boolean",
        description: "Include verbose source diagnostics.",
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export const sevenDtdGetLogsTool = {
  type: "function" as const,
  name: "seven_dtd_get_logs",
  description: "Get latest 7 Days to Die server logs.",
  parameters: {
    type: "object",
    properties: {
      lines: {
        type: "number",
        description: "Number of log lines to fetch (1-200).",
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export const sevenDtdStartTool = {
  type: "function" as const,
  name: "seven_dtd_start",
  description: "Start the 7 Days to Die server.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export const sevenDtdStopTool = {
  type: "function" as const,
  name: "seven_dtd_stop",
  description: "Stop the 7 Days to Die server.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export const sevenDtdRestartTool = {
  type: "function" as const,
  name: "seven_dtd_restart",
  description: "Restart the 7 Days to Die server.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export const sevenDtdExecCommandTool = {
  type: "function" as const,
  name: "seven_dtd_exec_command",
  description: "Execute a console command on the 7 Days to Die server.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Server console command string.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
};

function asObject(input?: string): Record<string, unknown> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const value = obj[key];
  if (typeof value !== "boolean") return undefined;
  return value;
}

function mapSevenDtdErrorCode(message: string): string {
  if (message.startsWith("seven_dtd_")) {
    const code = message.split(":")[0];
    return code || "seven_dtd_api_error";
  }
  return "seven_dtd_api_error";
}

export type SevenDtdToolName =
  | "seven_dtd_get_status"
  | "seven_dtd_get_summary"
  | "seven_dtd_get_logs"
  | "seven_dtd_start"
  | "seven_dtd_stop"
  | "seven_dtd_restart"
  | "seven_dtd_exec_command";

export function isSevenDtdToolName(name: string): name is SevenDtdToolName {
  return (
    name === "seven_dtd_get_status" ||
    name === "seven_dtd_get_summary" ||
    name === "seven_dtd_get_logs" ||
    name === "seven_dtd_start" ||
    name === "seven_dtd_stop" ||
    name === "seven_dtd_restart" ||
    name === "seven_dtd_exec_command"
  );
}

export async function runSevenDtdToolCall(params: {
  toolName: SevenDtdToolName;
  rawInput?: string;
  writeEnabled: boolean;
  client: SevenDtdOpsClient;
  requestContext?: RequestContext;
}): Promise<string> {
  const startedAt = Date.now();
  const input = asObject(params.rawInput);
  const requestContextOption = params.requestContext
    ? { requestContext: params.requestContext }
    : {};

  try {
    if (params.toolName === "seven_dtd_get_status") {
      return buildToolSuccessJson(await params.client.getStatus(params.requestContext), {
        startedAt,
        ...requestContextOption,
      });
    }

    if (params.toolName === "seven_dtd_get_summary") {
      const includePositions = pickBoolean(input, "includePositions");
      const maskIPs = pickBoolean(input, "maskIPs");
      const limitHostiles = pickNumber(input, "limitHostiles");
      const timeoutSeconds = pickNumber(input, "timeoutSeconds");
      const verbose = pickBoolean(input, "verbose");
      return buildToolSuccessJson(
        await params.client.getSummary(
          {
            ...(includePositions === undefined ? {} : { includePositions }),
            ...(maskIPs === undefined ? {} : { maskIPs }),
            ...(limitHostiles === undefined ? {} : { limitHostiles }),
            ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
            ...(verbose === undefined ? {} : { verbose }),
          },
          params.requestContext
        ),
        {
          startedAt,
          ...requestContextOption,
        }
      );
    }

    if (params.toolName === "seven_dtd_get_logs") {
      const lines = pickNumber(input, "lines");
      return buildToolSuccessJson(
        await params.client.getLogs(
          lines === undefined ? undefined : { lines },
          params.requestContext
        ),
        {
          startedAt,
          ...requestContextOption,
        }
      );
    }

    if (!params.writeEnabled) {
      return buildToolErrorJson("seven_dtd_write_disabled", "Write tools are disabled.", {
        startedAt,
        ...requestContextOption,
      });
    }

    if (params.toolName === "seven_dtd_start") {
      return buildToolSuccessJson(await params.client.start(params.requestContext), {
        startedAt,
        ...requestContextOption,
      });
    }

    if (params.toolName === "seven_dtd_stop") {
      return buildToolSuccessJson(await params.client.stop(params.requestContext), {
        startedAt,
        ...requestContextOption,
      });
    }

    if (params.toolName === "seven_dtd_restart") {
      return buildToolSuccessJson(await params.client.restart(params.requestContext), {
        startedAt,
        ...requestContextOption,
      });
    }

    const command = pickString(input, "command");
    if (!command) {
      return buildToolErrorJson("seven_dtd_invalid_params", "command is required.", {
        startedAt,
        ...requestContextOption,
      });
    }
    return buildToolSuccessJson(await params.client.execCommand(command, params.requestContext), {
      startedAt,
      ...requestContextOption,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildToolErrorJson(mapSevenDtdErrorCode(message), message.slice(0, 300), {
      startedAt,
      ...requestContextOption,
    });
  }
}
