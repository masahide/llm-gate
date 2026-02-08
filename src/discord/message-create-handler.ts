import { extractImageAttachmentUrls } from "./message-utils.js";
import {
  buildLmInputPayload,
  pickThreadOwnerId,
  resolveTargetThread,
  type LmInputPayload,
} from "./message-create-core.js";
import type { ToolLoopOptions } from "./tool-loop.js";
import type { RequestContext } from "../observability/request-context.js";
import { logger } from "../observability/logger.js";

type DecideInput = {
  isAuthorBot: boolean;
  mentionsBot: boolean;
  isThread: boolean;
  threadOwnerId: string | null;
  botUserId: string;
  body: string;
  hasImageAttachments: boolean;
  mentionLabel: string;
};

type DecideResult = {
  shouldHandle: boolean;
  shouldReact: boolean;
  useThreadContext: boolean;
  emptyBodyReply: string | null;
};

type MessageLike = {
  id: string;
  author: { bot: boolean };
  channel: {
    id: string;
    isThread: () => boolean;
  };
  mentions: { has: (id: string) => boolean };
  attachments?: { values: () => IterableIterator<{ url?: string | null }> };
  reply: (text: string) => Promise<unknown>;
  react: (emoji: string) => Promise<unknown>;
};

type HandleMessageCreateDeps = {
  botUserId: string;
  mentionLabel: string;
  assistantName: string;
  typingRefreshIntervalMs: number;
  debugBot: boolean;
  extractBody: (msg: any, botUserId?: string) => string;
  decideMessageCreateHandling: (input: DecideInput) => DecideResult;
  resolveTypingChannel: (
    msg: any,
    targetThread: any
  ) => { id: string; sendTyping: () => Promise<unknown> } | null;
  startTypingLoop: (
    channel: { id: string; sendTyping: () => Promise<unknown> },
    options: { intervalMs: number }
  ) => (() => void) | null | undefined;
  buildTranscriptFromThread: (
    thread: any,
    options: {
      botUserId: string;
      maxThreadMessages: number;
      fetchLimitMax: number;
      maxTranscriptChars: number;
      debugEnabled: boolean;
    }
  ) => Promise<string>;
  queryLmStudioResponseWithTools: (
    input: LmInputPayload,
    options?: ToolLoopOptions,
    requestContext?: RequestContext
  ) => Promise<string>;
  requestContext?: RequestContext;
  buildReply: (body: string, mentionLabel: string) => string;
  buildLmErrorReply: (error: unknown) => string;
  postReply: (
    msg: any,
    options: {
      targetThread: any;
      body: string;
      reply: string;
      assistantName: string;
    }
  ) => Promise<void>;
  warn?: (message: string, payload: Record<string, unknown>) => void;
  error?: (message: string, payload: Record<string, unknown>) => void;
};

const MAX_THREAD_MESSAGES = 200;
const DISCORD_FETCH_LIMIT_MAX = 100;
const MAX_TRANSCRIPT_CHARS = 20000;

export async function handleMessageCreate(
  msg: MessageLike,
  deps: HandleMessageCreateDeps
): Promise<void> {
  const warn = deps.warn ?? console.warn;
  const errorLog = deps.error ?? console.error;
  const mentionsBot = msg.mentions.has(deps.botUserId);
  const threadChannel = msg.channel.isThread() ? msg.channel : null;
  const threadOwnerId = pickThreadOwnerId(threadChannel);
  const body = deps.extractBody(msg, deps.botUserId);
  const imageUrls = extractImageAttachmentUrls(msg);

  const decision = deps.decideMessageCreateHandling({
    isAuthorBot: msg.author.bot,
    mentionsBot,
    isThread: threadChannel !== null,
    threadOwnerId,
    botUserId: deps.botUserId,
    body,
    hasImageAttachments: imageUrls.length > 0,
    mentionLabel: deps.mentionLabel,
  });
  if (!decision.shouldHandle) return;

  if (decision.emptyBodyReply) {
    await msg.reply(decision.emptyBodyReply);
    return;
  }

  const targetThread = resolveTargetThread(threadChannel, decision.useThreadContext);
  if (decision.shouldReact) {
    try {
      await msg.react("👀");
    } catch (error) {
      warn("[bot warn] リアクションの追加に失敗しました", {
        channelId: msg.channel.id,
        messageId: msg.id,
        error,
      });
      logger.warn("[message_create] failed to add reaction", deps.requestContext, {
        "error.code": "react_failed",
        "error.details": String(error),
      });
    }
  }

  const typingChannel = deps.resolveTypingChannel(msg, targetThread);
  const stopTyping = typingChannel
    ? deps.startTypingLoop(typingChannel, { intervalMs: deps.typingRefreshIntervalMs })
    : null;

  try {
    let transcript = "";
    if (targetThread) {
      transcript = await deps.buildTranscriptFromThread(targetThread, {
        botUserId: deps.botUserId,
        maxThreadMessages: MAX_THREAD_MESSAGES,
        fetchLimitMax: DISCORD_FETCH_LIMIT_MAX,
        maxTranscriptChars: MAX_TRANSCRIPT_CHARS,
        debugEnabled: deps.debugBot,
      });
    }
    const lmInput: LmInputPayload = buildLmInputPayload({
      body,
      transcript,
      imageUrls,
    });

    let reply: string;
    try {
      const lmReply = deps.requestContext
        ? await deps.queryLmStudioResponseWithTools(lmInput, undefined, deps.requestContext)
        : await deps.queryLmStudioResponseWithTools(lmInput);
      reply = lmReply || deps.buildReply(body, deps.mentionLabel);
    } catch (error) {
      errorLog("[bot error] LM Studio への問い合わせに失敗しました", {
        channelId: msg.channel.id,
        messageId: msg.id,
        threadId:
          targetThread && typeof targetThread === "object" && "id" in targetThread
            ? String(targetThread.id)
            : undefined,
        error,
      });
      reply = deps.buildLmErrorReply(error);
      logger.error("[message_create] lm query failed", deps.requestContext, {
        "error.code": "lm_query_failed",
        "error.message": error instanceof Error ? error.message : String(error),
      });
    }

    await deps.postReply(msg, {
      targetThread,
      body,
      reply,
      assistantName: deps.assistantName,
    });
  } finally {
    stopTyping?.();
  }
}
