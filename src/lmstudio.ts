// src/lmstudio.ts
export type ResponseJson = Record<string, any>;

export type LmConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export function extractOutputText(resp: ResponseJson): string {
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
    maxOutputTokens?: number;
  }
): Promise<ResponseJson> {
  const body: Record<string, any> = {
    model: cfg.model,
    input,
    // ここが重要
    max_output_tokens: opts?.maxOutputTokens ?? 1024,
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
