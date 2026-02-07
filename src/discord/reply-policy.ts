function normalize(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function buildReply(text: string, mentionLabel: string): string {
  const t = normalize(text).toLowerCase();
  if (t === "help" || t === "h" || t === "?") {
    return [
      "使い方",
      `- ${mentionLabel} こんにちは`,
      `- ${mentionLabel} ping`,
      `- ${mentionLabel} time`,
      `- ${mentionLabel} help`,
    ].join("\n");
  }
  if (t === "ping") return "pong";
  if (t === "time") return `いまは ${new Date().toLocaleString("ja-JP")} です`;
  if (t.includes("こんばんは")) return "こんばんは。続きやります？";
  if (t.includes("こんにちは") || t.includes("こん")) return "こんにちは。どうしました？";
  if (t.includes("おはよう")) return "おはようございます。今日は何を進めます？";
  return `なるほど。${text} ということですね`;
}
