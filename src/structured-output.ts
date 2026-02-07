import { z } from "zod";

export const structuredSchema = z.object({
  summary: z.string().min(10, "Summary must be at least 10 characters long.").max(512),
  tone: z.enum(["calm", "energetic", "neutral"]),
  actions: z.array(z.string().min(5, "Describe each action concretely.")).min(2).max(4),
});

export type StructuredOutput = z.infer<typeof structuredSchema>;

export const structuredInstructions = `
{
  "summary": "A concise 1-2 sentence summary of the situation",
  "tone": "calm | energetic | neutral",
  "actions": [
    "Provide 2-4 concrete next actions that can be done immediately",
    "Keep each action short (about 10 to 50 characters)"
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
