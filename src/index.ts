import "dotenv/config";
import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { queryLmStudioResponse } from "./basic.js";

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
  const trimmed = withoutMention.trim();
  return trimmed;
}

function logDebugInfo(msg: Message, normalized: string, mentionsBot: boolean) {
  if (!debugBot) return;
  console.debug(
    `[bot debug] author=${msg.author.tag} channel=${msg.channel.id} normalized="${normalized}" mentionsBot=${mentionsBot}`
  );
}

function shouldHandleCommand(msg: Message): boolean {
  if (msg.author.bot) return false;
  const normalized = normalize(msg.content);
  const botId = client.user?.id;
  const mentionsBot = botId ? msg.mentions.has(botId) : false;
  logDebugInfo(msg, normalized, mentionsBot);
  if (debugBot && !mentionsBot) {
    console.debug("[bot debug] No mention detected; message ignored.");
  }
  return mentionsBot;
}

client.on(Events.MessageCreate, async (msg) => {
  if (!shouldHandleCommand(msg)) return;

  const body = extractBody(msg);
  if (!body) {
    await msg.reply(`用件を教えてください。${mentionLabel()} help で使い方を出します`);
    return;
  }

  let reply: string;
  try {
    const lmReply = await queryLmStudioResponse(body);
    reply = lmReply || buildReply(body);
  } catch (err) {
    console.error("[bot error] LM Studio への問い合わせに失敗しました", err);
    reply = buildReply(body);
  }

  if (msg.channel.isTextBased()) {
    await msg.channel.sendTyping();
  }

  const chunks = reply.length <= 1800 ? [reply] : [reply.slice(0, 1800), reply.slice(1800)];
  for (const c of chunks) {
    await msg.reply(c);
  }
});

await client.login(token);
