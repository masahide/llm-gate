import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { buildLmErrorReply, extractBody } from "./discord/message-utils.js";
import { handleMessageCreate } from "./discord/message-create-handler.js";
import { decideMessageCreateHandling } from "./discord/message-create-policy.js";
import {
  postReply,
  resolveTypingChannel,
  startTypingLoop,
} from "./discord/message-runtime-service.js";
import { buildReply } from "./discord/reply-policy.js";
import { buildTranscriptFromThread } from "./discord/thread-transcript.js";
import { queryLmStudioResponseWithTools } from "./discord/tool-loop.js";
import { getAssistantName, isAssistantDebugEnabled } from "./config/assistant.js";
import { buildToolLoopOptionsForMessage } from "./discord/context-tools.js";
import { buildRequestContext } from "./observability/request-context.js";
import { logger } from "./observability/logger.js";

const token = process.env.DISCORD_TOKEN;

if (!token) throw new Error("DISCORD_TOKEN を .env に設定してください");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const debugBot = isAssistantDebugEnabled();
const TYPING_REFRESH_INTERVAL_MS = 8000;

client.once(Events.ClientReady, (c) => {
  console.log(`起動しました: ${c.user.tag}`);
});

function mentionLabel(): string {
  return client.user ? `<@${client.user.id}>` : "@bot";
}

client.on(Events.MessageCreate, async (msg) => {
  const botUserId = client.user?.id;
  if (!botUserId) return;
  const toolLoopOptions = buildToolLoopOptionsForMessage(msg);
  const requestContext = buildRequestContext(msg, toolLoopOptions);
  logger.info("[message_create] received", requestContext);
  await handleMessageCreate(msg, {
    botUserId,
    mentionLabel: mentionLabel(),
    assistantName: getAssistantName(),
    typingRefreshIntervalMs: TYPING_REFRESH_INTERVAL_MS,
    debugBot,
    extractBody,
    decideMessageCreateHandling,
    resolveTypingChannel,
    startTypingLoop,
    buildTranscriptFromThread,
    queryLmStudioResponseWithTools: (input, options) =>
      queryLmStudioResponseWithTools(
        input,
        { ...toolLoopOptions, ...(options ?? {}) },
        requestContext
      ),
    requestContext,
    buildReply,
    buildLmErrorReply,
    postReply,
  });
});

await client.login(token);
