import "dotenv/config";
import { createHash } from "node:crypto";
import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import type { AnyThreadChannel } from "discord.js";
import { queryLmStudioResponse } from "./basic.js";
import { buildThreadContext } from "./context/thread-context.js";
import { formatTranscript } from "./context/transcript.js";
import { shouldHandleMessage } from "./discord/should-handle.js";

const token = process.env.DISCORD_TOKEN;

if (!token) throw new Error("DISCORD_TOKEN を .env に設定してください");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const debugBot = process.env.DEBUG_SUZUME === "true";
const MAX_THREAD_MESSAGES = 200;
const DISCORD_FETCH_LIMIT_MAX = 100;
const MAX_TRANSCRIPT_CHARS = 20000;

function mentionLabel(): string {
  return client.user ? `<@${client.user.id}>` : "@bot";
}

client.once(Events.ClientReady, (c) => {
  console.log(`起動しました: ${c.user.tag}`);
});

function normalize(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function buildReply(text: string): string {
  const t = normalize(text).toLowerCase();
  if (t === "help" || t === "h" || t === "?") {
    const label = mentionLabel();
    return [
      "使い方",
      `- ${label} こんにちは`,
      `- ${label} ping`,
      `- ${label} time`,
      `- ${label} help`,
    ].join("\n");
  }
  if (t === "ping") return "pong";
  if (t === "time") return `いまは ${new Date().toLocaleString("ja-JP")} です`;
  if (t.includes("こんにちは") || t.includes("こん")) return "こんにちは。どうしました？";
  if (t.includes("おはよう")) return "おはようございます。今日は何を進めます？";
  if (t.includes("こんばんは")) return "こんばんは。続きやります？";
  return `なるほど。${text} ということですね`;
}

function getBotMentionRegex(): RegExp | null {
  const botId = client.user?.id;
  if (!botId) return null;
  return new RegExp(`<@!?${botId}>`, "g");
}

function extractBody(msg: Message): string {
  const content = normalize(msg.content);
  const mentionPattern = getBotMentionRegex();
  const withoutMention = mentionPattern ? content.replace(mentionPattern, " ") : content;
  return withoutMention.trim();
}

function splitReply(text: string): string[] {
  return text.length <= 1800 ? [text] : [text.slice(0, 1800), text.slice(1800)];
}

function buildThreadName(text: string): string {
  const withoutMentions = text
    .replace(/<@!?\d+>/g, " ")
    .replace(/<@&\d+>/g, " ")
    .replace(/<#\d+>/g, " ");
  const base = normalize(withoutMentions).slice(0, 70) || "conversation";
  return `suzume: ${base}`.slice(0, 90);
}

function isBotOwnedThread(channel: AnyThreadChannel, botUserId: string): boolean {
  return channel.ownerId === botUserId;
}

async function ensureThreadForMention(
  msg: Message,
  body: string
): Promise<AnyThreadChannel | null> {
  if (msg.channel.isThread()) return msg.channel;
  if (!msg.inGuild()) return null;

  if (msg.hasThread && msg.thread) return msg.thread;

  try {
    return await msg.startThread({
      name: buildThreadName(body),
      autoArchiveDuration: 60,
      reason: "bot conversation thread",
    });
  } catch (error) {
    console.error("[bot warn] スレッド作成に失敗しました", {
      channelId: msg.channel.id,
      messageId: msg.id,
      error,
    });
    return null;
  }
}

function transcriptDigest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

async function buildTranscriptFromThread(
  thread: AnyThreadChannel,
  botUserId: string
): Promise<string> {
  try {
    const allMessages: Message[] = [];
    let before: string | undefined;

    while (allMessages.length < MAX_THREAD_MESSAGES) {
      const remaining = MAX_THREAD_MESSAGES - allMessages.length;
      const limit = Math.min(remaining, DISCORD_FETCH_LIMIT_MAX);
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
        botUserId,
        maxMessages: MAX_THREAD_MESSAGES,
        maxChars: MAX_TRANSCRIPT_CHARS,
      }
    );

    const transcript = formatTranscript(turns);
    if (debugBot) {
      console.debug("[bot debug] transcript", {
        threadId: thread.id,
        chars: transcript.length,
        hash: transcriptDigest(transcript),
        turns: turns.length,
      });
    }

    return transcript;
  } catch (error) {
    console.error("[bot warn] スレッド履歴の取得に失敗しました", {
      threadId: thread.id,
      error,
    });
    return "";
  }
}

async function postReply(
  msg: Message,
  targetThread: AnyThreadChannel | null,
  body: string,
  reply: string
): Promise<void> {
  const chunks = splitReply(reply);
  const postingThread = targetThread ?? (await ensureThreadForMention(msg, body));

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

client.on(Events.MessageCreate, async (msg) => {
  const botUserId = client.user?.id;
  if (!botUserId) return;

  const mentionsBot = msg.mentions.has(botUserId);
  const threadChannel = msg.channel.isThread() ? msg.channel : null;
  const threadOwnerId = threadChannel?.ownerId ?? null;

  if (
    !shouldHandleMessage({
      isAuthorBot: msg.author.bot,
      mentionsBot,
      isThread: threadChannel !== null,
      threadOwnerId,
      botUserId,
    })
  ) {
    return;
  }

  const body = extractBody(msg);
  if (!body) {
    await msg.reply(`用件を教えてください。${mentionLabel()} help で使い方を出します`);
    return;
  }

  const targetThread = threadChannel
    ? isBotOwnedThread(threadChannel, botUserId)
      ? threadChannel
      : null
    : null;

  if (mentionsBot) {
    try {
      await msg.react("👀");
    } catch (error) {
      console.warn("[bot warn] リアクションの追加に失敗しました", {
        channelId: msg.channel.id,
        messageId: msg.id,
        error,
      });
    }
  }

  if (targetThread?.isTextBased()) {
    await targetThread.sendTyping();
  } else if (msg.channel.isTextBased()) {
    await msg.channel.sendTyping();
  }

  let lmInput = body;
  if (targetThread && isBotOwnedThread(targetThread, botUserId)) {
    const transcript = await buildTranscriptFromThread(targetThread, botUserId);
    if (transcript) lmInput = transcript;
  }

  let reply: string;
  try {
    const lmReply = await queryLmStudioResponse(lmInput);
    reply = lmReply || buildReply(body);
  } catch (error) {
    console.error("[bot error] LM Studio への問い合わせに失敗しました", {
      channelId: msg.channel.id,
      messageId: msg.id,
      threadId: targetThread?.id,
      error,
    });
    reply = buildReply(body);
  }

  await postReply(msg, targetThread, body, reply);
});

await client.login(token);
