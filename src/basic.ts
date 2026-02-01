import { createResponse, extractOutputText } from "./lmstudio.js";
import type { LmConfig } from "./lmstudio.js";
import type { ResponseFunctionCall, ResponsesResponse } from "./lmstudio.js";
import { structuredInstructions, parseStructuredText } from "./structured-output.js";
import {
  currentTimeTool,
  formatCurrentTime,
  parseCurrentTimeParams,
} from "./tools/current-time.js";

export const cfg: LmConfig = {
  baseUrl: process.env.LM_BASE_URL ?? "http://192.168.10.37:1234/v1",
  apiKey: process.env.LM_API_KEY ?? "",
  model: process.env.LM_MODEL ?? "qwen/qwen3-vl-4b-instruct",
};

export function findToolCall(
  response: ResponsesResponse,
  toolName: string
): ResponseFunctionCall | undefined {
  return response.output?.find(
    (item): item is ResponseFunctionCall => item.type === "function_call" && item.name === toolName
  );
}

export async function runCurrentTimeTool(cfg: LmConfig) {
  const prompt = `
今の時刻を知る必要があるときは current_time ツールを呼び出してください。ツールに渡す JSON は { "timezone": "Asia/Tokyo" } などの形にしてください。
  `.trim();

  const initial = await createResponse(cfg, prompt, {
    temperature: 0.1,
    maxOutputTokens: 160,
    instructions:
      "必要な情報は current_time ツールを使って取得し、ツールの出力だけを返信してください。",
    tools: [currentTimeTool],
  });

  const toolCall = findToolCall(initial, currentTimeTool.name);
  if (!toolCall) {
    console.log("current_time tool の呼び出しがない応答:", extractOutputText(initial));
    return;
  }

  const params = parseCurrentTimeParams(toolCall.input);
  const toolOutput = formatCurrentTime(params);

  const toolResult = {
    type: "function_call_output",
    call_id: toolCall.call_id ?? toolCall.name,
    output: toolOutput,
  };

  const followUp = await createResponse(cfg, [toolResult], {
    previousResponseId: initial.id,
    tools: [currentTimeTool],
  });

  console.log("current_time tool の返答:", extractOutputText(followUp));
}

export async function queryLmStudioResponse(userMessage: string): Promise<string> {
  const response = await createResponse(cfg, userMessage, {
    temperature: 0.2,
    maxOutputTokens: 350,
    instructions: [
    "あなたは親しみやすいアシスタント Suzume です。日本語で簡潔かつ礼儀正しく答えてください。",
    "以下のユーザー要求に対して、具体的かつ前向きな応答を行ってください。",
  ].join("\n"),
  });
  const result = extractOutputText(response).trim();
  return result || "少しお待ちください、確認しています。";
}
