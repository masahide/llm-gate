import type { ToolLoopOptions } from "../discord/tool-loop.js";
import { resolveEffectiveChannelId } from "../discord/allowlist.js";

export type RequestContext = {
  requestId: string;
  guildId: string;
  effectiveChannelId: string;
  threadId: string;
  messageId: string;
  persona: string;
  enabledTools: string[];
};

type MessageLike = {
  id: string;
  guildId?: string | null;
  channel?: {
    id?: string;
    parentId?: string | null;
    isThread?: () => boolean;
  };
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toolNamesFromOptions(options?: ToolLoopOptions): string[] {
  const tools = options?.tools;
  if (!Array.isArray(tools)) return [];
  const names = tools
    .map((tool) => {
      if (!tool || typeof tool !== "object") return "";
      const raw = (tool as { name?: unknown }).name;
      return typeof raw === "string" ? raw : "";
    })
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

export function buildRequestContext(msg: MessageLike, options?: ToolLoopOptions): RequestContext {
  const requestId = `${Date.now().toString(36)}-${randomId()}`;
  const isThread = typeof msg.channel?.isThread === "function" && msg.channel.isThread();
  return {
    requestId,
    guildId: msg.guildId ?? "",
    effectiveChannelId: resolveEffectiveChannelId(msg),
    threadId: isThread && msg.channel?.id ? msg.channel.id : "",
    messageId: msg.id,
    persona: options?.persona ?? "default",
    enabledTools: toolNamesFromOptions(options),
  };
}
