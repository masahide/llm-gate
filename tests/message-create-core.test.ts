import { describe, expect, test } from "vitest";
import {
  buildLmInputPayload,
  pickThreadOwnerId,
  resolveTargetThread,
} from "../src/discord/message-create-core.js";

describe("message-create-core", () => {
  test("pickThreadOwnerId returns ownerId when it is a string", () => {
    expect(pickThreadOwnerId({ ownerId: "bot-user" })).toBe("bot-user");
    expect(pickThreadOwnerId({ ownerId: 42 })).toBeNull();
    expect(pickThreadOwnerId(null)).toBeNull();
  });

  test("resolveTargetThread uses thread context only when allowed", () => {
    const thread = { id: "t1" };
    expect(resolveTargetThread(thread, true)).toBe(thread);
    expect(resolveTargetThread(thread, false)).toBeNull();
    expect(resolveTargetThread(null, true)).toBeNull();
  });

  test("buildLmInputPayload uses transcript when available", () => {
    expect(
      buildLmInputPayload({
        body: "body",
        transcript: "transcript",
        imageUrls: [],
      })
    ).toBe("transcript");
  });

  test("buildLmInputPayload keeps body when transcript is empty", () => {
    expect(
      buildLmInputPayload({
        body: "body",
        transcript: "",
        imageUrls: [],
      })
    ).toBe("body");
  });

  test("buildLmInputPayload builds text+image payload when images exist", () => {
    expect(
      buildLmInputPayload({
        body: "body",
        transcript: "transcript",
        imageUrls: ["https://example.com/cat.png"],
      })
    ).toEqual({
      text: "transcript",
      imageUrls: ["https://example.com/cat.png"],
    });
  });
});
