export type CurrentTimeParams = {
  timezone: string;
};

const DEFAULT_TIMEZONE = "UTC";

export const currentTimeTool = {
  type: "function" as const,
  name: "current_time",
  description: "指定されたタイムゾーンの現在時刻を ISO 8601 形式で返します。",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA タイムゾーン名（例: Asia/Tokyo）",
      },
    },
    required: ["timezone"],
    additionalProperties: false,
  },
};

export function parseCurrentTimeParams(input?: string): CurrentTimeParams {
  if (!input) return { timezone: DEFAULT_TIMEZONE };
  try {
    const parsed = JSON.parse(input) as { timezone?: string };
    if (typeof parsed?.timezone === "string" && parsed.timezone.length > 0) {
      return { timezone: parsed.timezone };
    }
  } catch {
    // fall through to default
  }
  return { timezone: DEFAULT_TIMEZONE };
}

export function formatCurrentTime(params: CurrentTimeParams): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: params.timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  return `${params.timezone} の現在時刻: ${formatter.format(now)}`;
}
