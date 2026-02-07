import { describe, expect, test } from "vitest";
import { buildThreadContext, type ThreadMessageLike } from "../src/context/thread-context.js";

function msg(partial: Partial<ThreadMessageLike>): ThreadMessageLike {
  return {
    id: partial.id ?? "m",
    authorId: partial.authorId ?? "u1",
    authorName: partial.authorName ?? "alice",
    authorBot: partial.authorBot ?? false,
    content: partial.content ?? "hello",
    system: partial.system ?? false,
    createdTimestamp: partial.createdTimestamp ?? 1,
  };
}

describe("buildThreadContext", () => {
  test("sorts chronologically, strips mention, and assigns roles", () => {
    const turns = buildThreadContext(
      [
        msg({
          id: "2",
          authorId: "bot",
          authorName: "suzume",
          authorBot: true,
          content: "了解",
          createdTimestamp: 20,
        }),
        msg({
          id: "1",
          authorId: "u1",
          authorName: "alice",
          content: "<@bot> 予定を教えて",
          createdTimestamp: 10,
        }),
        msg({
          id: "3",
          authorId: "bot2",
          authorName: "otherbot",
          authorBot: true,
          content: "ignore",
          createdTimestamp: 30,
        }),
        msg({ id: "4", authorId: "u2", authorName: "bob", content: "   ", createdTimestamp: 40 }),
        msg({
          id: "5",
          authorId: "u2",
          authorName: "bob",
          content: "補足です",
          createdTimestamp: 50,
        }),
      ],
      { botUserId: "bot", maxMessages: 10, maxChars: 1000 }
    );

    expect(turns).toEqual([
      { role: "user", text: "alice: 予定を教えて" },
      { role: "assistant", text: "了解" },
      { role: "user", text: "bob: 補足です" },
    ]);
  });

  test("drops older turns when char budget is exceeded", () => {
    const turns = buildThreadContext(
      [
        msg({
          id: "1",
          authorId: "u1",
          authorName: "alice",
          content: "first",
          createdTimestamp: 1,
        }),
        msg({
          id: "2",
          authorId: "bot",
          authorName: "suzume",
          authorBot: true,
          content: "second",
          createdTimestamp: 2,
        }),
        msg({
          id: "3",
          authorId: "u1",
          authorName: "alice",
          content: "third",
          createdTimestamp: 3,
        }),
      ],
      { botUserId: "bot", maxMessages: 10, maxChars: 25 }
    );

    expect(turns).toEqual([{ role: "user", text: "alice: third" }]);
  });

  test("limits by message count before char trimming", () => {
    const turns = buildThreadContext(
      [
        msg({ id: "1", authorId: "u1", authorName: "alice", content: "m1", createdTimestamp: 1 }),
        msg({ id: "2", authorId: "u1", authorName: "alice", content: "m2", createdTimestamp: 2 }),
        msg({ id: "3", authorId: "u1", authorName: "alice", content: "m3", createdTimestamp: 3 }),
      ],
      { botUserId: "bot", maxMessages: 2, maxChars: 1000 }
    );

    expect(turns).toEqual([
      { role: "user", text: "alice: m2" },
      { role: "user", text: "alice: m3" },
    ]);
  });
});
