export type ResponseOutputTextItem = {
  type: "output_text";
  text: string;
};

export type ResponseMessageOutput = {
  type: "message";
  content: Array<ResponseOutputTextItem>;
};

export type ResponseFunctionCall = {
  type: "function_call";
  name: string;
  call_id?: string;
  input?: string;
};

export type ResponseOutputItem = ResponseMessageOutput | ResponseFunctionCall;

export type ResponsesResponse = {
  id?: string;
  output?: ResponseOutputItem[];
  [key: string]: unknown;
};

export type ResponseInput = string | Record<string, unknown> | Array<Record<string, unknown>>;

export type CreateResponseOptions = {
  previousResponseId?: string | undefined;
  temperature?: number | undefined;
  instructions?: string | undefined;
  maxOutputTokens?: number | undefined;
  tools?: unknown[] | undefined;
};

export type LmConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export function extractOutputText(resp: ResponsesResponse): string {
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
  input: ResponseInput,
  opts: CreateResponseOptions = {}
): Promise<ResponsesResponse> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_output_tokens: opts.maxOutputTokens ?? 1024,
  };

  body.input = input;

  if (opts.previousResponseId) body.previous_response_id = opts.previousResponseId;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (opts.instructions) body.instructions = opts.instructions;
  if (Array.isArray(opts.tools) && opts.tools.length) body.tools = opts.tools;

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

  return (await res.json()) as ResponsesResponse;
}
