export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  text: string;
};

export type ThreadMessageLike = {
  id: string;
  authorId: string;
  authorName: string;
  authorBot: boolean;
  content: string;
  system: boolean;
  createdTimestamp: number;
};

export type BuildThreadContextOptions = {
  botUserId: string;
  maxMessages?: number;
  maxChars?: number;
};

const DEFAULT_MAX_MESSAGES = 200;
const DEFAULT_MAX_CHARS = 20000;

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function stripBotMention(input: string, botUserId: string): string {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  return input.replace(mentionPattern, " ");
}

function toTurn(message: ThreadMessageLike, botUserId: string): ChatTurn | null {
  if (message.system) return null;
  if (message.authorBot && message.authorId !== botUserId) return null;

  const cleaned = normalizeText(stripBotMention(message.content, botUserId));
  if (!cleaned) return null;

  if (message.authorId === botUserId) {
    return { role: "assistant", text: cleaned };
  }

  return { role: "user", text: `${message.authorName}: ${cleaned}` };
}

function estimateTurnChars(turn: ChatTurn): number {
  return `${turn.role}: ${turn.text}\n`.length;
}

function trimToBudget(turns: ChatTurn[], maxChars: number): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let total = 0;

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (!turn) continue;

    const size = estimateTurnChars(turn);
    if (size > maxChars) {
      const headroom = Math.max(0, maxChars - `${turn.role}: `.length - 3);
      const truncated = turn.text.slice(Math.max(0, turn.text.length - headroom));
      return [{ role: turn.role, text: `...${truncated}` }];
    }

    if (total + size > maxChars) break;
    kept.unshift(turn);
    total += size;
  }

  return kept;
}

export function buildThreadContext(
  messages: ThreadMessageLike[],
  options: BuildThreadContextOptions
): ChatTurn[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  const turns = [...messages]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => toTurn(message, options.botUserId))
    .filter((turn): turn is ChatTurn => turn !== null);

  const latestTurns = turns.slice(-maxMessages);
  return trimToBudget(latestTurns, maxChars);
}
