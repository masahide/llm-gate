import { describe, expect, test, vi } from "vitest";
import { handleMessageCreate } from "../src/discord/message-create-handler.js";

function createMessageMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    author: { bot: false },
    channel: {
      id: "c1",
      isThread: () => false,
      isTextBased: () => true,
      sendTyping: vi.fn().mockResolvedValue(undefined),
    },
    mentions: { has: () => true },
    attachments: { values: function* () {} },
    reply: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("handleMessageCreate", () => {
  test("replies guidance when body is empty", async () => {
    const msg = createMessageMock();
    const query = vi.fn();
    await handleMessageCreate(msg, {
      botUserId: "bot",
      mentionLabel: "<@bot>",
      assistantName: "suzume",
      typingRefreshIntervalMs: 8000,
      debugBot: false,
      extractBody: () => "",
      decideMessageCreateHandling: () => ({
        shouldHandle: true,
        shouldReact: true,
        useThreadContext: false,
        emptyBodyReply: "用件を教えてください。",
      }),
      resolveTypingChannel: vi.fn(),
      startTypingLoop: vi.fn(),
      buildTranscriptFromThread: vi.fn(),
      queryLmStudioResponseWithTools: query,
      buildReply: vi.fn(),
      buildLmErrorReply: vi.fn(),
      postReply: vi.fn(),
    });

    expect(msg.reply).toHaveBeenCalledWith("用件を教えてください。");
    expect(query).not.toHaveBeenCalled();
  });

  test("uses transcript input for bot-owned thread", async () => {
    const thread = {
      id: "t1",
      ownerId: "bot",
      isThread: () => true,
      isTextBased: () => true,
      sendTyping: vi.fn().mockResolvedValue(undefined),
    };
    const msg = createMessageMock({
      channel: thread,
      mentions: { has: () => false },
    });
    const query = vi.fn().mockResolvedValue("reply");
    const postReply = vi.fn().mockResolvedValue(undefined);
    const stopTyping = vi.fn();
    await handleMessageCreate(msg, {
      botUserId: "bot",
      mentionLabel: "<@bot>",
      assistantName: "suzume",
      typingRefreshIntervalMs: 8000,
      debugBot: false,
      extractBody: () => "body",
      decideMessageCreateHandling: () => ({
        shouldHandle: true,
        shouldReact: false,
        useThreadContext: true,
        emptyBodyReply: null,
      }),
      resolveTypingChannel: () => thread,
      startTypingLoop: () => stopTyping,
      buildTranscriptFromThread: vi.fn().mockResolvedValue("transcript"),
      queryLmStudioResponseWithTools: query,
      buildReply: vi.fn(),
      buildLmErrorReply: vi.fn(),
      postReply,
    });

    expect(query).toHaveBeenCalledWith("transcript");
    expect(postReply).toHaveBeenCalledTimes(1);
    expect(stopTyping).toHaveBeenCalledTimes(1);
  });

  test("passes text+imageUrls payload when image attachments exist", async () => {
    const msg = createMessageMock({
      attachments: {
        values: function* () {
          yield {
            url: "https://example.com/cat.png",
            contentType: "image/png",
            name: "cat.png",
          };
        },
      },
    });
    const query = vi.fn().mockResolvedValue("reply");
    await handleMessageCreate(msg, {
      botUserId: "bot",
      mentionLabel: "<@bot>",
      assistantName: "suzume",
      typingRefreshIntervalMs: 8000,
      debugBot: false,
      extractBody: () => "この画像を説明して",
      decideMessageCreateHandling: () => ({
        shouldHandle: true,
        shouldReact: false,
        useThreadContext: false,
        emptyBodyReply: null,
      }),
      resolveTypingChannel: () => null,
      startTypingLoop: vi.fn(),
      buildTranscriptFromThread: vi.fn(),
      queryLmStudioResponseWithTools: query,
      buildReply: vi.fn(),
      buildLmErrorReply: vi.fn(),
      postReply: vi.fn().mockResolvedValue(undefined),
    });

    expect(query).toHaveBeenCalledWith({
      text: "この画像を説明して",
      imageUrls: ["https://example.com/cat.png"],
    });
  });

  test("posts LM error reply when query fails", async () => {
    const msg = createMessageMock();
    const postReply = vi.fn().mockResolvedValue(undefined);
    const buildLmErrorReply = vi.fn().mockReturnValue("error reply");
    await handleMessageCreate(msg, {
      botUserId: "bot",
      mentionLabel: "<@bot>",
      assistantName: "suzume",
      typingRefreshIntervalMs: 8000,
      debugBot: false,
      extractBody: () => "body",
      decideMessageCreateHandling: () => ({
        shouldHandle: true,
        shouldReact: false,
        useThreadContext: false,
        emptyBodyReply: null,
      }),
      resolveTypingChannel: () => null,
      startTypingLoop: vi.fn(),
      buildTranscriptFromThread: vi.fn(),
      queryLmStudioResponseWithTools: vi.fn().mockRejectedValue(new Error("boom")),
      buildReply: vi.fn(),
      buildLmErrorReply,
      postReply,
      error: vi.fn(),
    });

    expect(buildLmErrorReply).toHaveBeenCalledTimes(1);
    expect(postReply.mock.calls[0]?.[1]?.reply).toBe("error reply");
  });
});
