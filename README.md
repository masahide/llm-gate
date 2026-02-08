# llm-gate

## LM Studio Responses API Tool Use

`pnpm dev` (`src/index.ts`) runs the Discord bot with thread-first behavior:

- mention the bot in a regular channel to create/reuse a thread and receive replies inside that thread
- continue chatting in bot-owned threads without mentioning the bot
- rebuild thread history every turn and send it as a role-prefixed transcript to LM Studio (without `previous_response_id`)
- resolve tool calls (`current_time`, `web_research_digest`, `assistant_profile`) through the Node-side tool loop before posting final replies
- inject context-aware tool sets and persona (`default` / `seven_dtd_ops`) before each LM call

If thread creation is unavailable (permissions/DM), the bot falls back to normal reply in the current channel.

## Environment Variables

Core:

- `DISCORD_TOKEN`
- `LM_BASE_URL`
- `LM_API_KEY`
- `LM_MODEL`
- `ASSISTANT_NAME`
- `DEBUG_ASSISTANT` (`true` to enable debug logs)
- `DEBUG_WEB_RESEARCH` (`true` to enable web debug logs)

7dtd conditional tool exposure:

- `ALLOWED_GUILD_IDS` (comma-separated)
- `ALLOWED_CHANNEL_IDS` (comma-separated)
- `SEVEN_DTD_OPS_BASE_URL` (default: `https://stats7dtd.suzu.me.uk`)
- `SEVEN_DTD_OPS_TOKEN`
- `SEVEN_DTD_OPS_TIMEOUT_MS` (default: `10000`)
- `SEVEN_DTD_ENABLE_WRITE_TOOLS` (`true` to enable `start/stop/restart/exec`)

## 7dtd Operational Example

1. Set allowlist and 7dtd env values:
   - `ALLOWED_GUILD_IDS=...`
   - `ALLOWED_CHANNEL_IDS=...`
   - `SEVEN_DTD_OPS_TOKEN=...`
2. Start bot with `pnpm dev`.
3. In an allowed channel (or its thread), mention bot and ask:
   - `@bot サーバー状態を教えて`
   - `@bot ログを50行見せて`
4. In a non-allowed channel, confirm the bot does not expose 7dtd tools and replies as normal assistant.
