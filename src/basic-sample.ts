import { cfg, queryLmStudioResponse, runCurrentTimeTool } from "./basic.js";
import { createResponse, extractOutputText } from "./lmstudio.js";
import { structuredInstructions, parseStructuredText } from "./structured-output.js";

async function main() {
  const structuredPrompt = [
    "日本語で短い自己紹介と、今日できる具体的なアクションを提示してください。",
    "出力は必ず JSON で、以下のフォーマットに従ってください。",
    structuredInstructions,
    "JSON 以外の文章や説明は含めないでください。",
  ].join("\n");

  const r1 = await createResponse(cfg, structuredPrompt, {
    temperature: 0.1,
    maxOutputTokens: 256,
    instructions: "JSON のみ出力。説明や箇条書きは不要。",
  });

  const structuredText = extractOutputText(r1);
  console.log("生成された構造化出力:", structuredText);

  const structuredResult = parseStructuredText(structuredText);
  if (structuredResult.success) {
    console.log("構造化結果:", structuredResult.data);
  } else {
    console.error("構造化出力の検証に失敗しました:", structuredResult.error);
    if (structuredResult.issues) {
      console.error("Zod の検証情報:", structuredResult.issues);
    }
  }

  await runCurrentTimeTool(cfg);

  const sampleResponse = await queryLmStudioResponse("最近の学習成果を教えてください");
  console.log("LM Studio sample reply:", sampleResponse);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
