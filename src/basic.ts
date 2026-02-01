const BASE_URL = process.env.LM_BASE_URL ?? "http://192.168.10.37:1234/v1";
const MODEL = process.env.LM_MODEL ?? "qwen/qwen3-vl-4b-instruct";

// LM Studio は通常 API キー不要ですが、構成によっては必要なことがあります。
// 必要なら LM_API_KEY を設定してください。
const API_KEY = process.env.LM_API_KEY ?? "";

type AnyJson = Record<string, any>;

function extractOutputText(resp: AnyJson): string {
  const out = resp.output;
  if (!Array.isArray(out)) return "";

  const chunks: string[] = [];
  for (const item of out) {
    if (item?.type !== "message") continue;
    const content = item?.content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") {
        chunks.push(c.text);
      }
    }
  }
  return chunks.join("");
}

async function main() {
  const body = {
    model: MODEL,
    input: "日本語で短く、今日できることを3つ提案して",
    temperature: 0.1,
  };

  const res = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  }

  const json = (await res.json()) as AnyJson;
  const text = extractOutputText(json);
  console.log(text || JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
