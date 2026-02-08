import type { SevenDtdOpsClient } from "../seven-dtd/client.js";

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
  description: "Get aggregated 7 Days to Die server summary for a time window.",
  parameters: {
    type: "object",
    properties: {
      minutes: {
        type: "number",
        description: "Summary window in minutes (1-1440).",
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

function buildError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}

function buildSuccess(data: unknown): string {
  return JSON.stringify({ ok: true, data });
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
}): Promise<string> {
  const input = asObject(params.rawInput);

  try {
    if (params.toolName === "seven_dtd_get_status") {
      return buildSuccess(await params.client.getStatus());
    }

    if (params.toolName === "seven_dtd_get_summary") {
      const minutes = pickNumber(input, "minutes");
      return buildSuccess(
        await params.client.getSummary(minutes === undefined ? undefined : { minutes })
      );
    }

    if (params.toolName === "seven_dtd_get_logs") {
      const lines = pickNumber(input, "lines");
      return buildSuccess(await params.client.getLogs(lines === undefined ? undefined : { lines }));
    }

    if (!params.writeEnabled) {
      return buildError("seven_dtd_write_disabled", "Write tools are disabled.");
    }

    if (params.toolName === "seven_dtd_start") {
      return buildSuccess(await params.client.start());
    }

    if (params.toolName === "seven_dtd_stop") {
      return buildSuccess(await params.client.stop());
    }

    if (params.toolName === "seven_dtd_restart") {
      return buildSuccess(await params.client.restart());
    }

    const command = pickString(input, "command");
    if (!command) {
      return buildError("seven_dtd_invalid_params", "command is required.");
    }
    return buildSuccess(await params.client.execCommand(command));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildError("seven_dtd_api_error", message.slice(0, 300));
  }
}
