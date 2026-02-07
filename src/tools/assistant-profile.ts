import fs from "node:fs";
import path from "node:path";
import { getAssistantName } from "../config/assistant.js";
import { cfg } from "../config/lm.js";

export type AssistantProfileOutput = {
  assistant_name: string;
  model: string;
  version: string;
  started_at: string;
  uptime_day: number;
};

let cachedVersion: string | null = null;

function resolveVersion(): string {
  if (cachedVersion) return cachedVersion;
  const envVersion = process.env.npm_package_version;
  if (envVersion && envVersion.length > 0) {
    cachedVersion = envVersion;
    return cachedVersion;
  }

  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    cachedVersion = parsed.version ?? "unknown";
    return cachedVersion;
  } catch {
    cachedVersion = "unknown";
    return cachedVersion;
  }
}

export const assistantProfileTool = {
  type: "function" as const,
  name: "assistant_profile",
  description:
    "Returns public assistant profile fields: assistant_name, model, version, started_at, uptime_day.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export function runAssistantProfile(): AssistantProfileOutput {
  const nowMs = Date.now();
  const uptimeMs = Math.max(0, Math.floor(process.uptime() * 1000));
  const startedAt = new Date(nowMs - uptimeMs).toISOString();
  const uptimeDay = Number((uptimeMs / (24 * 60 * 60 * 1000)).toFixed(4));

  return {
    assistant_name: getAssistantName(),
    model: cfg.model,
    version: resolveVersion(),
    started_at: startedAt,
    uptime_day: uptimeDay,
  };
}
