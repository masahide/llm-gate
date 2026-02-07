const DEFAULT_ASSISTANT_NAME = "Assistant";

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getAssistantName(): string {
  const raw = process.env.ASSISTANT_NAME;
  if (!raw) return DEFAULT_ASSISTANT_NAME;
  const normalized = normalizeName(raw);
  return normalized.length > 0 ? normalized : DEFAULT_ASSISTANT_NAME;
}

export function isAssistantDebugEnabled(): boolean {
  return process.env.DEBUG_ASSISTANT === "true";
}
