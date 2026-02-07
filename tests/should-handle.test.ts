import { describe, expect, test } from "vitest";
import { shouldHandleMessage } from "../src/discord/should-handle.js";

describe("shouldHandleMessage", () => {
  test("requires mention in normal channel", () => {
    expect(
      shouldHandleMessage({
        isAuthorBot: false,
        mentionsBot: false,
        isThread: false,
        botUserId: "bot",
      })
    ).toBe(false);

    expect(
      shouldHandleMessage({
        isAuthorBot: false,
        mentionsBot: true,
        isThread: false,
        botUserId: "bot",
      })
    ).toBe(true);
  });

  test("handles bot-owned thread without mention", () => {
    expect(
      shouldHandleMessage({
        isAuthorBot: false,
        mentionsBot: false,
        isThread: true,
        threadOwnerId: "bot",
        botUserId: "bot",
      })
    ).toBe(true);
  });

  test("ignores bot author messages", () => {
    expect(
      shouldHandleMessage({
        isAuthorBot: true,
        mentionsBot: true,
        isThread: true,
        threadOwnerId: "bot",
        botUserId: "bot",
      })
    ).toBe(false);
  });
});
