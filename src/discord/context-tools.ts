import { isAllowedContext, loadAllowlistConfigFromEnv } from "./allowlist.js";
import type { ToolLoopOptions, ToolLoopPersona } from "./tool-loop.js";
import { toolsForContext } from "./tool-registry.js";
import { readSevenDtdWriteToolsEnabled } from "../seven-dtd/client.js";

type MessageContextLike = {
  guildId?: string | null;
  channel?: {
    id?: string;
    parentId?: string | null;
    isThread?: () => boolean;
  };
};

export function resolvePersonaForContext(allowSevenDtd: boolean): ToolLoopPersona {
  return allowSevenDtd ? "seven_dtd_ops" : "default";
}

export function buildToolLoopOptionsForMessage(msg: MessageContextLike): ToolLoopOptions {
  const allowSevenDtd = isAllowedContext(msg, loadAllowlistConfigFromEnv());
  const enableWriteTools = readSevenDtdWriteToolsEnabled();

  return {
    persona: resolvePersonaForContext(allowSevenDtd),
    tools: toolsForContext({ allowSevenDtd, enableWriteTools }),
  };
}
