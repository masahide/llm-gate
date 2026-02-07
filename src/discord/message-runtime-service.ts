import { buildThreadName, splitReply } from "./message-utils.js";

type ThreadStarter = {
  channel: { id?: string; isThread: () => boolean };
  id?: string;
  inGuild: () => boolean;
  hasThread?: boolean;
  thread?: unknown;
  startThread: (options: {
    name: string;
    autoArchiveDuration: number;
    reason: string;
  }) => Promise<unknown>;
};

type ReplyMessage = {
  reply: (text: string) => Promise<unknown>;
};

type SendableThread = {
  send: (text: string) => Promise<unknown>;
};

type TypingChannel = {
  id: string;
  sendTyping: () => Promise<unknown>;
};

type TypingResolvable = {
  id: string;
  isTextBased: () => boolean;
  sendTyping?: () => Promise<unknown>;
};

function isConnectTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const withCode = error as { code?: string };
  return withCode.code === "UND_ERR_CONNECT_TIMEOUT";
}

export async function ensureThreadForMention(
  msg: ThreadStarter,
  options: {
    body: string;
    assistantName: string;
    warn?: (message: string, payload: Record<string, unknown>) => void;
  }
): Promise<unknown | null> {
  const warn = options.warn ?? console.error;
  if (msg.channel.isThread()) return msg.channel;
  if (!msg.inGuild()) return null;
  if (msg.hasThread && msg.thread) return msg.thread;

  try {
    return await msg.startThread({
      name: buildThreadName({ assistantName: options.assistantName, text: options.body }),
      autoArchiveDuration: 60,
      reason: "bot conversation thread",
    });
  } catch (error) {
    warn("[bot warn] スレッド作成に失敗しました", {
      channelId: msg.channel.id,
      messageId: msg.id,
      error,
    });
    return null;
  }
}

export async function postReply(
  msg: ThreadStarter & ReplyMessage,
  options: {
    targetThread: SendableThread | null;
    body: string;
    reply: string;
    assistantName: string;
    warn?: (message: string, payload: Record<string, unknown>) => void;
  }
): Promise<void> {
  const chunks = splitReply(options.reply);
  const postingThread =
    options.targetThread ??
    ((await ensureThreadForMention(msg, {
      body: options.body,
      assistantName: options.assistantName,
      ...(options.warn ? { warn: options.warn } : {}),
    })) as SendableThread | null);

  if (postingThread) {
    for (const chunk of chunks) {
      await postingThread.send(chunk);
    }
    return;
  }

  for (const chunk of chunks) {
    await msg.reply(chunk);
  }
}

export function resolveTypingChannel(
  msg: { channel: TypingResolvable },
  targetThread: TypingResolvable | null
): TypingChannel | null {
  if (targetThread?.isTextBased() && targetThread.sendTyping) return targetThread as TypingChannel;
  if (msg.channel.isTextBased() && msg.channel.sendTyping) return msg.channel as TypingChannel;
  return null;
}

export function startTypingLoop(
  channel: TypingChannel,
  options?: {
    intervalMs?: number;
    warn?: (message: string, payload: Record<string, unknown>) => void;
  }
): () => void {
  const warn = options?.warn ?? console.warn;
  const intervalMs = options?.intervalMs ?? 8000;
  let stopped = false;
  let typingWarned = false;

  const sendTyping = async () => {
    if (stopped) return;
    try {
      await channel.sendTyping();
      typingWarned = false;
    } catch (error) {
      if (isConnectTimeoutError(error)) return;
      if (!typingWarned) {
        warn("[bot warn] typing 表示の更新に失敗しました", {
          channelId: channel.id,
          error,
        });
        typingWarned = true;
      }
    }
  };

  void sendTyping();
  const timer = setInterval(() => {
    void sendTyping();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
