import { describe, expect, test, vi } from "vitest";
import { buildTranscriptFromThread } from "../src/discord/thread-transcript.js";

type MockMessage = {
  id: string;
  author: { id: string; username: string; globalName?: string | null; bot: boolean };
  content: string;
  system: boolean;
  createdTimestamp: number;
};

type MockFetched = {
  size: number;
  values: () => IterableIterator<MockMessage>;
  lastKey: () => string | undefined;
};

function makeFetched(messages: MockMessage[]): MockFetched {
  return {
    size: messages.length,
    values: function* values() {
      for (const m of messages) yield m;
    },
    lastKey: () => messages[messages.length - 1]?.id,
  };
}

describe("buildTranscriptFromThread", () => {
  test("fetches messages with pagination and builds transcript", async () => {
    const page1 = makeFetched([
      {
        id: "m2",
        author: { id: "u1", username: "hamu", bot: false },
        content: "こんにちは",
        system: false,
        createdTimestamp: 2,
      },
      {
        id: "m1",
        author: { id: "b1", username: "suzume", bot: true },
        content: "はい",
        system: false,
        createdTimestamp: 1,
      },
    ]);
    const page2 = makeFetched([]);

    const fetch = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const thread = { id: "t1", messages: { fetch } };

    const out = await buildTranscriptFromThread(thread, {
      botUserId: "b1",
      maxThreadMessages: 3,
      fetchLimitMax: 2,
      maxTranscriptChars: 1000,
      debugEnabled: false,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]?.limit).toBe(2);
    expect(out).toContain("user: hamu: こんにちは");
    expect(out).toContain("assistant: はい");
  });

  test("returns empty transcript when fetch fails", async () => {
    const thread = {
      id: "t2",
      messages: { fetch: vi.fn().mockRejectedValue(new Error("network")) },
    };
    const warn = vi.fn();
    const out = await buildTranscriptFromThread(thread, {
      botUserId: "b1",
      debugEnabled: false,
      warn,
    });
    expect(out).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
