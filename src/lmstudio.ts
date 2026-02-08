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
  arguments?: string;
};

export type ResponseOutputItem = ResponseMessageOutput | ResponseFunctionCall;

export type ResponsesResponse = {
  id?: string;
  output?: ResponseOutputItem[];
  [key: string]: unknown;
};

export type InputTextContent = {
  type: "input_text";
  text: string;
};

export type InputImageContent = {
  type: "input_image";
  image_url: string;
};

export type UserInputMessage = {
  role: "user";
  content: Array<InputTextContent | InputImageContent>;
};

export type FunctionCallOutputInput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export type ResponseInput = string | UserInputMessage[] | FunctionCallOutputInput[];

export type LmToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: readonly string[] | string[];
    additionalProperties?: boolean;
  };
};

export type CreateResponseOptions = {
  previousResponseId?: string | undefined;
  temperature?: number | undefined;
  instructions?: string | undefined;
  maxOutputTokens?: number | undefined;
  tools?: LmToolDefinition[] | undefined;
  timeoutMs?: number | undefined;
};

export type LmConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};

type ResponseRequestBody = {
  model: string;
  max_output_tokens: number;
  input: ResponseInput;
  previous_response_id?: string;
  temperature?: number;
  instructions?: string;
  tools?: LmToolDefinition[];
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

export function buildResponseRequestBody(
  cfg: LmConfig,
  input: ResponseInput,
  opts: CreateResponseOptions = {}
): ResponseRequestBody {
  const body: ResponseRequestBody = {
    model: cfg.model,
    max_output_tokens: opts.maxOutputTokens ?? 1024,
    input,
  };

  if (opts.previousResponseId) body.previous_response_id = opts.previousResponseId;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (opts.instructions) body.instructions = opts.instructions;
  if (Array.isArray(opts.tools) && opts.tools.length) body.tools = opts.tools;
  return body;
}

export async function createResponse(
  cfg: LmConfig,
  input: ResponseInput,
  opts: CreateResponseOptions = {}
): Promise<ResponsesResponse> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const body = buildResponseRequestBody(cfg, input, opts);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LM Studio request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  }

  return (await res.json()) as ResponsesResponse;
}
