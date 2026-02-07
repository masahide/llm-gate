import type { ChatTurn } from "./thread-context.js";

export function formatTranscript(turns: ChatTurn[]): string {
  return turns.map((turn) => `${turn.role}: ${turn.text}`).join("\n");
}
