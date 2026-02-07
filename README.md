# llm-gate

## LM Studio Responses API Tool Use

`pnpm sample` (`src/basic-sample.ts`) shows the structured output → `current_time` tool cycle: it first requests JSON output, then waits for the tool call, executes the helper in `src/tools/current-time.ts`, and re-submits the tool output via `function_call_output`. Set `LM_BASE_URL`, `LM_API_KEY`, and `LM_MODEL` before running `pnpm sample` to see the invocation timeline and the timezone reply.

`pnpm dev` (`src/index.ts`) runs the Discord bot with thread-first behavior:

- mention the bot in a regular channel to create/reuse a thread and receive replies inside that thread
- continue chatting in bot-owned threads without mentioning the bot
- rebuild thread history every turn and send it as a role-prefixed transcript to LM Studio (without `previous_response_id`)

If thread creation is unavailable (permissions/DM), the bot falls back to normal reply in the current channel.
