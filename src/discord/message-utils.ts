import type { Message } from "discord.js";

const DISCORD_MESSAGE_HARD_LIMIT = 1800;
const THREAD_TITLE_BODY_LIMIT = 70;
const THREAD_TITLE_LIMIT = 90;
const MAX_INPUT_IMAGES = 4;
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg)(?:$|\?)/i;

function normalize(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function stripDiscordMentions(input: string): string {
  return input
    .replace(/<@!?\d+>/g, " ")
    .replace(/<@&\d+>/g, " ")
    .replace(/<#\d+>/g, " ");
}

function botMentionPattern(botUserId: string): RegExp {
  return new RegExp(`<@!?${botUserId}>`, "g");
}

export function extractBodyFromContent(content: string, botUserId?: string): string {
  const normalized = normalize(content);
  if (!botUserId) return normalized;
  return normalize(normalized.replace(botMentionPattern(botUserId), " "));
}

export function extractBody(msg: Message, botUserId?: string): string {
  return extractBodyFromContent(msg.content, botUserId);
}

type AttachmentLike = {
  url?: string | null;
  contentType?: string | null;
  name?: string | null;
};

type AttachmentCollectionLike = {
  values: () => IterableIterator<AttachmentLike>;
};

function isImageAttachment(attachment: AttachmentLike): boolean {
  if (typeof attachment.contentType === "string" && attachment.contentType.startsWith("image/")) {
    return true;
  }
  if (typeof attachment.name === "string" && IMAGE_FILE_PATTERN.test(attachment.name)) {
    return true;
  }
  if (typeof attachment.url === "string" && IMAGE_FILE_PATTERN.test(attachment.url)) {
    return true;
  }
  return false;
}

export function extractImageAttachmentUrls(
  msg: { attachments?: AttachmentCollectionLike },
  maxCount = MAX_INPUT_IMAGES
): string[] {
  if (!msg.attachments) return [];
  const urls: string[] = [];
  for (const attachment of msg.attachments.values()) {
    if (urls.length >= maxCount) break;
    if (!isImageAttachment(attachment)) continue;
    if (typeof attachment.url !== "string" || attachment.url.length === 0) continue;
    urls.push(attachment.url);
  }
  return urls;
}

export function splitReply(text: string): string[] {
  if (text.length <= DISCORD_MESSAGE_HARD_LIMIT) return [text];

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += DISCORD_MESSAGE_HARD_LIMIT) {
    chunks.push(text.slice(i, i + DISCORD_MESSAGE_HARD_LIMIT));
  }
  return chunks;
}

export function buildThreadName(params: { assistantName: string; text: string }): string {
  const base = normalize(stripDiscordMentions(params.text)).slice(0, THREAD_TITLE_BODY_LIMIT);
  const threadBody = base || "conversation";
  return `${params.assistantName}: ${threadBody}`.slice(0, THREAD_TITLE_LIMIT);
}

function isLmTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("timed out after");
}

export function buildLmErrorReply(error: unknown): string {
  if (isLmTimeoutError(error)) {
    return "回答の生成がタイムアウトしました。少し時間を置いてもう一度お試しください。";
  }
  if (error instanceof Error) {
    if (error.message.includes("fetch failed")) {
      return "LLM サーバーへ接続できませんでした。サーバー状態を確認して、もう一度お試しください。";
    }
    if (error.message.includes("HTTP ")) {
      return "LLM サーバーでエラーが発生しました。しばらくしてから再試行してください。";
    }
  }
  return "回答の生成中にエラーが発生しました。時間を置いてもう一度お試しください。";
}
