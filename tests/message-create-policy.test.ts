import { describe, expect, test } from "vitest";
import { decideMessageCreateHandling } from "../src/discord/message-create-policy.js";

describe("decideMessageCreateHandling", () => {
  test("ignores message when shouldHandleMessage is false", () => {
    const out = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: false,
      isThread: false,
      threadOwnerId: null,
      botUserId: "bot",
      body: "hello",
      hasImageAttachments: false,
      mentionLabel: "<@bot>",
    });
    expect(out.shouldHandle).toBe(false);
    expect(out.shouldReact).toBe(false);
    expect(out.useThreadContext).toBe(false);
  });

  test("returns empty-body reply when body is blank", () => {
    const out = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: true,
      isThread: false,
      threadOwnerId: null,
      botUserId: "bot",
      body: " ",
      hasImageAttachments: false,
      mentionLabel: "<@bot>",
    });
    expect(out.shouldHandle).toBe(true);
    expect(out.emptyBodyReply).toContain("help");
  });

  test("uses thread context only for bot-owned threads", () => {
    const owned = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: false,
      isThread: true,
      threadOwnerId: "bot",
      botUserId: "bot",
      body: "続き",
      hasImageAttachments: false,
      mentionLabel: "<@bot>",
    });
    expect(owned.useThreadContext).toBe(true);

    const foreign = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: false,
      isThread: true,
      threadOwnerId: "someone",
      botUserId: "bot",
      body: "続き",
      hasImageAttachments: false,
      mentionLabel: "<@bot>",
    });
    expect(foreign.useThreadContext).toBe(false);
  });

  test("adds reaction only when explicitly mentioned", () => {
    const mentioned = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: true,
      isThread: false,
      threadOwnerId: null,
      botUserId: "bot",
      body: "hello",
      hasImageAttachments: false,
      mentionLabel: "<@bot>",
    });
    expect(mentioned.shouldReact).toBe(true);

    const noMention = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: false,
      isThread: true,
      threadOwnerId: "bot",
      botUserId: "bot",
      body: "hello",
      hasImageAttachments: false,
      mentionLabel: "<@bot>",
    });
    expect(noMention.shouldReact).toBe(false);
  });

  test("does not return empty-body reply when image attachments exist", () => {
    const out = decideMessageCreateHandling({
      isAuthorBot: false,
      mentionsBot: true,
      isThread: false,
      threadOwnerId: null,
      botUserId: "bot",
      body: " ",
      hasImageAttachments: true,
      mentionLabel: "<@bot>",
    });
    expect(out.shouldHandle).toBe(true);
    expect(out.emptyBodyReply).toBeNull();
  });
});
