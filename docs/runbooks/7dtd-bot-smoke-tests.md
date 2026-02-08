# 7DTD Bot Smoke Tests

## Prerequisites

- `DISCORD_TOKEN`, `LM_BASE_URL`, `LM_MODEL` are set.
- `ALLOWED_GUILD_IDS` and `ALLOWED_CHANNEL_IDS` include one test channel.
- 7DTD settings are configured (`SEVEN_DTD_OPS_BASE_URL`, `SEVEN_DTD_OPS_TOKEN`).

## Steps

1. Start bot with `pnpm dev`.
2. In allowed channel, mention bot and ask `@bot server status`.
3. Confirm response includes 7DTD information.
4. In non-allowed channel, mention bot and ask same question.
5. Confirm 7DTD-specific answers are not exposed.

## Observability Checks

- Confirm logs include `requestId`.
- Confirm logs include `tool.persona` and `tool.enabledTools`.
- Confirm `discord.guildId` and `discord.effectiveChannelId` are present.

## Failure Checks

1. Temporarily set invalid `SEVEN_DTD_OPS_TOKEN`.
2. Ask for server status.
3. Confirm bot returns JSON-like tool failure and does not crash.
4. Confirm error code starts with `seven_dtd_`.
