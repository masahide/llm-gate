# llm-gate

## LM Studio Responses API Tool Use

`pnpm dev` (`src/index.ts`) runs the Discord bot with thread-first behavior:

- mention the bot in a regular channel to create/reuse a thread and receive replies inside that thread
- continue chatting in bot-owned threads without mentioning the bot
- rebuild thread history every turn and send it as a role-prefixed transcript to LM Studio (without `previous_response_id`)
- resolve tool calls (`current_time`, `web_research_digest`) through the Node-side tool loop before posting final replies

If thread creation is unavailable (permissions/DM), the bot falls back to normal reply in the current channel.
