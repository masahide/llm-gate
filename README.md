# llm-gate

## LM Studio Responses API Tool Use

`pnpm sample` (`src/basic-sample.ts`) shows the structured output → `current_time` tool cycle: it first requests JSON output, then waits for the tool call, executes the helper in `src/tools/current-time.ts`, and re-submits the tool output via `function_call_output`. Set `LM_BASE_URL`, `LM_API_KEY`, and `LM_MODEL` before running `pnpm sample` to see the invocation timeline and the timezone reply.

`pnpm dev` (`src/index.ts`) now runs the Discord bot that listens for mentions, forwards the cleaned message to LM Studio via `queryLmStudioResponse`, and posts the generated answer back in the channel.
