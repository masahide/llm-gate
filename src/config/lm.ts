import type { LmConfig } from "../lmstudio.js";

export const cfg: LmConfig = {
  baseUrl: process.env.LM_BASE_URL ?? "http://192.168.10.37:1234/v1",
  apiKey: process.env.LM_API_KEY ?? "",
  model: process.env.LM_MODEL ?? "qwen/qwen3-vl-4b-instruct",
};
