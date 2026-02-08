import { describe, expect, test } from "vitest";
import {
  isAllowedContext,
  parseCsvIds,
  resolveEffectiveChannelId,
  type AllowlistConfig,
} from "../src/discord/allowlist.js";

describe("allowlist", () => {
  test("parseCsvIds trims and removes empty values", () => {
    expect(parseCsvIds(" a, b ,, c ")).toEqual(new Set(["a", "b", "c"]));
    expect(parseCsvIds("a,b,")).toEqual(new Set(["a", "b"]));
    expect(parseCsvIds(",,,")).toEqual(new Set());
    expect(parseCsvIds(" ")).toEqual(new Set());
    expect(parseCsvIds("")).toEqual(new Set());
  });

  test("resolveEffectiveChannelId uses parentId for thread", () => {
    const message = {
      channel: {
        id: "thread-1",
        parentId: "channel-1",
        isThread: () => true,
      },
    };
    expect(resolveEffectiveChannelId(message)).toBe("channel-1");
  });

  test("resolveEffectiveChannelId returns empty string when thread parentId is missing", () => {
    expect(
      resolveEffectiveChannelId({
        channel: {
          id: "thread-1",
          parentId: null,
          isThread: () => true,
        },
      })
    ).toBe("");
    expect(
      resolveEffectiveChannelId({
        channel: {
          id: "thread-2",
          isThread: () => true,
        },
      })
    ).toBe("");
  });

  test("isAllowedContext returns false when allowlist is empty", () => {
    const config: AllowlistConfig = { guildIds: new Set(), channelIds: new Set() };
    expect(
      isAllowedContext(
        {
          guildId: "g1",
          channel: { id: "c1", isThread: () => false },
        },
        config
      )
    ).toBe(false);
  });

  test("isAllowedContext matches guild and channel with AND condition", () => {
    const config: AllowlistConfig = {
      guildIds: new Set(["g1"]),
      channelIds: new Set(["c1"]),
    };

    expect(
      isAllowedContext(
        {
          guildId: "g1",
          channel: { id: "c1", isThread: () => false },
        },
        config
      )
    ).toBe(true);

    expect(
      isAllowedContext(
        {
          guildId: "g2",
          channel: { id: "c1", isThread: () => false },
        },
        config
      )
    ).toBe(false);
  });

  test("isAllowedContext returns false for thread when parentId is null or undefined", () => {
    const config: AllowlistConfig = {
      guildIds: new Set(["g1"]),
      channelIds: new Set(["c1"]),
    };

    expect(
      isAllowedContext(
        {
          guildId: "g1",
          channel: { id: "thread-1", parentId: null, isThread: () => true },
        },
        config
      )
    ).toBe(false);
    expect(
      isAllowedContext(
        {
          guildId: "g1",
          channel: { id: "thread-2", isThread: () => true },
        },
        config
      )
    ).toBe(false);
  });
});
