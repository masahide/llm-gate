import { z } from "zod";

export const structuredSchema = z.object({
  summary: z.string().min(10, "要約は 10 文字以上").max(512),
  tone: z.enum(["calm", "energetic", "neutral"]),
  actions: z.array(z.string().min(5, "アクションを具体的に記述してください")).min(2).max(4),
});

export type StructuredOutput = z.infer<typeof structuredSchema>;

export const structuredInstructions = `
{
  "summary": "2 文程度で状況をまとめた文章",
  "tone": "calm または energetic または neutral",
  "actions": [
    "今すぐできる具体的なアクションを 2~4 個",
    "行動は短文（10 ~ 50 文字）で出力"
  ]
}
`.trim();

export type StructuredParseResult =
  | { success: true; data: StructuredOutput }
  | { success: false; error: string; issues?: z.ZodIssue[] };

export function parseStructuredText(text: string): StructuredParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { success: false, error: `JSON parse failed: ${(err as Error).message}` };
  }

  const validation = structuredSchema.safeParse(parsed);
  if (validation.success) {
    return { success: true, data: validation.data };
  }

  return { success: false, error: "schema validation failed", issues: validation.error.issues };
}
