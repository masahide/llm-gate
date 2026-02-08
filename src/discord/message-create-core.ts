export type LmInputPayload = string | { text: string; imageUrls: string[] };

export function pickThreadOwnerId(threadChannel: unknown): string | null {
  if (!threadChannel || typeof threadChannel !== "object") return null;
  if (!("ownerId" in threadChannel)) return null;
  return typeof threadChannel.ownerId === "string" ? threadChannel.ownerId : null;
}

export function resolveTargetThread<T>(
  threadChannel: T | null,
  useThreadContext: boolean
): T | null {
  if (!threadChannel) return null;
  return useThreadContext ? threadChannel : null;
}

export function buildLmInputPayload(params: {
  body: string;
  transcript: string;
  imageUrls: string[];
}): LmInputPayload {
  const inputText = params.transcript || params.body;
  return params.imageUrls.length > 0 ? { text: inputText, imageUrls: params.imageUrls } : inputText;
}
