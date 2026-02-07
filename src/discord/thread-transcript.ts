import { createHash } from "node:crypto";
import { buildThreadContext } from "../context/thread-context.js";
import { formatTranscript } from "../context/transcript.js";

type AuthorLike = {
  id: string;
  username: string;
  globalName?: string | null;
  bot: boolean;
};

type MessageLike = {
  id: string;
  author: AuthorLike;
  content: string;
  system: boolean;
  createdTimestamp: number;
};

type FetchedMessagesLike = {
  size: number;
  values: () => IterableIterator<MessageLike>;
  lastKey: () => string | undefined;
};

type ThreadLike = {
  id: string;
  messages: {
    fetch: (options: { limit: number; before?: string }) => Promise<FetchedMessagesLike>;
  };
};

type BuildTranscriptOptions = {
  botUserId: string;
  maxThreadMessages?: number;
  fetchLimitMax?: number;
  maxTranscriptChars?: number;
  debugEnabled?: boolean;
  debug?: (message: string, payload: Record<string, unknown>) => void;
  warn?: (message: string, payload: Record<string, unknown>) => void;
};

function transcriptDigest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export async function buildTranscriptFromThread(
  thread: ThreadLike,
  options: BuildTranscriptOptions
): Promise<string> {
  const maxThreadMessages = options.maxThreadMessages ?? 200;
  const fetchLimitMax = options.fetchLimitMax ?? 100;
  const maxTranscriptChars = options.maxTranscriptChars ?? 20000;
  const debugEnabled = options.debugEnabled ?? false;
  const debug = options.debug ?? console.debug;
  const warn = options.warn ?? console.error;

  try {
    const allMessages: MessageLike[] = [];
    let before: string | undefined;

    while (allMessages.length < maxThreadMessages) {
      const remaining = maxThreadMessages - allMessages.length;
      const limit = Math.min(remaining, fetchLimitMax);
      const fetched = await thread.messages.fetch({
        limit,
        ...(before ? { before } : {}),
      });
      if (fetched.size === 0) break;

      allMessages.push(...fetched.values());
      before = fetched.lastKey() ?? undefined;
      if (!before) break;
    }

    const turns = buildThreadContext(
      allMessages.map((message) => ({
        id: message.id,
        authorId: message.author.id,
        authorName: message.author.globalName ?? message.author.username,
        authorBot: message.author.bot,
        content: message.content,
        system: message.system,
        createdTimestamp: message.createdTimestamp,
      })),
      {
        botUserId: options.botUserId,
        maxMessages: maxThreadMessages,
        maxChars: maxTranscriptChars,
      }
    );

    const transcript = formatTranscript(turns);
    if (debugEnabled) {
      debug("[bot debug] transcript", {
        threadId: thread.id,
        chars: transcript.length,
        hash: transcriptDigest(transcript),
        turns: turns.length,
      });
    }
    return transcript;
  } catch (error) {
    warn("[bot warn] スレッド履歴の取得に失敗しました", {
      threadId: thread.id,
      error,
    });
    return "";
  }
}
