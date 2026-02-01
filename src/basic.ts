import { createResponse, extractOutputText } from "./lmstudio.js";
import { structuredInstructions, parseStructuredText } from "./structured-output.js";

const cfg = {
  baseUrl: process.env.LM_BASE_URL ?? "http://192.168.10.37:1234/v1",
  apiKey: process.env.LM_API_KEY ?? "",
  model: process.env.LM_MODEL ?? "qwen/qwen3-vl-4b-instruct",
};

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

  const r2 = await createResponse(
    cfg,
    "前の自己紹介文の末尾に10文字だけ追加した全文を1回だけ出力。2行目に追加した10文字だけを出力。説明は禁止。",
    {
      previousResponseId: r1.id,
      temperature: 0.1,
      maxOutputTokens: 128,
      instructions: "繰り返し禁止。指定形式以外は出力しない。",
    }
  );
  console.log(extractOutputText(r2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
