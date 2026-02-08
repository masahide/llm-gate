export type AllowlistConfig = {
  guildIds: Set<string>;
  channelIds: Set<string>;
};

type AllowlistMessageLike = {
  guildId?: string | null;
  channel?: {
    id?: string;
    isThread?: () => boolean;
    parentId?: string | null;
  };
};

export function parseCsvIds(raw?: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}

export function loadAllowlistConfigFromEnv(): AllowlistConfig {
  return {
    guildIds: parseCsvIds(process.env.ALLOWED_GUILD_IDS),
    channelIds: parseCsvIds(process.env.ALLOWED_CHANNEL_IDS),
  };
}

export function resolveEffectiveChannelId(msg: AllowlistMessageLike): string {
  const channel = msg.channel;
  if (!channel) return "";
  const isThread = typeof channel.isThread === "function" && channel.isThread();
  if (isThread) return channel.parentId ?? "";
  return channel.id ?? "";
}

export function isAllowedContext(msg: AllowlistMessageLike, config: AllowlistConfig): boolean {
  if (config.guildIds.size === 0 || config.channelIds.size === 0) return false;
  const guildId = msg.guildId ?? "";
  if (!guildId || !config.guildIds.has(guildId)) return false;

  const channelId = resolveEffectiveChannelId(msg);
  if (!channelId || !config.channelIds.has(channelId)) return false;

  return true;
}
