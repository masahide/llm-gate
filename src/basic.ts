import { createResponse, extractOutputText } from "./lmstudio.js";

const cfg = {
  baseUrl: process.env.LM_BASE_URL ?? "http://192.168.10.37:1234/v1",
  apiKey: process.env.LM_API_KEY ?? "",
  model: process.env.LM_MODEL ?? "qwen/qwen3-vl-4b-instruct",
};

async function main() {
  const r1 = await createResponse(cfg, "日本語で短く自己紹介して", {
    temperature: 0.1,
    maxOutputTokens: 128,
  });
  console.log(extractOutputText(r1));

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
