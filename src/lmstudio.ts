// src/lmstudio.ts
export type ResponseJson = Record<string, any>;

export type LmConfig = {
  baseUrl: string; // 末尾 /v1 まで含める
  apiKey?: string;
  model: string;
};

export function extractOutputText(resp: ResponseJson): string {
  if (typeof resp.output_text === "string" && resp.output_text.length > 0) {
    return resp.output_text;
  }

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

export async function createResponse(
  cfg: LmConfig,
  input: string,
  opts?: {
    previousResponseId?: string;
    temperature?: number;
    instructions?: string;
  }
): Promise<ResponseJson> {
  const body: Record<string, any> = {
    model: cfg.model,
    input,
  };

  if (opts?.previousResponseId) body.previous_response_id = opts.previousResponseId;
  if (typeof opts?.temperature === "number") body.temperature = opts.temperature;
  if (opts?.instructions) body.instructions = opts.instructions;

  const res = await fetch(`${cfg.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  }

  return (await res.json()) as ResponseJson;
}
