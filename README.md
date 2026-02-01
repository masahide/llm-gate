# llm-gate

## LM Studio Responses API Tool Use

`pnpm dev` (`src/basic.ts`) now walks through two Responses API interactions: it first retrieves structured output, and then issues a follow-up request that supplies the `current_time` tool definition so the model can emit a `function_call`. The helper logic in `src/tools/current-time.ts` formats the timezone payload, parses the tool input, and renders the response, so you can trace the OpenAI-compatible `responses` loop end-to-end. Set `LM_BASE_URL`, `LM_API_KEY`, and `LM_MODEL` before running `pnpm dev` to watch the tool invocation and the resulting timezone string in the console.
