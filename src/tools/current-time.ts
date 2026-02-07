export type CurrentTimeParams = {
  timezone: string;
};

const DEFAULT_TIMEZONE = "Asia/Tokyo";
const JST_ALIASES = new Set(["jst", "japan", "japan time", "tokyo"]);

export const currentTimeTool = {
  type: "function" as const,
  name: "current_time",
  description:
    "Returns the current time for the specified timezone. If missing or invalid, defaults to Asia/Tokyo (Japan time).",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone name (for example: Asia/Tokyo).",
      },
    },
    required: [],
    additionalProperties: false,
  },
};

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(raw: string): string {
  const input = raw.trim();
  const lower = input.toLowerCase();
  if (JST_ALIASES.has(lower)) return DEFAULT_TIMEZONE;
  if (isValidTimezone(input)) return input;
  return DEFAULT_TIMEZONE;
}

export function parseCurrentTimeParams(input?: string): CurrentTimeParams {
  if (!input) return { timezone: DEFAULT_TIMEZONE };
  try {
    const parsed = JSON.parse(input) as { timezone?: string };
    if (typeof parsed?.timezone === "string" && parsed.timezone.length > 0) {
      return { timezone: normalizeTimezone(parsed.timezone) };
    }
  } catch {
    // fall through to default
  }
  return { timezone: DEFAULT_TIMEZONE };
}

export function formatCurrentTime(params: CurrentTimeParams): string {
  const now = new Date();
  const timezone = normalizeTimezone(params.timezone);
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  return `${timezone} の現在時刻: ${formatter.format(now)}`;
}
