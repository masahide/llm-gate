import { describe, expect, test } from "vitest";
import { buildRequestContext } from "../src/observability/request-context.js";

describe("request context", () => {
  test("builds context from thread message", () => {
    const ctx = buildRequestContext(
      {
        id: "m1",
        guildId: "g1",
        channel: {
          id: "t1",
          parentId: "c1",
          isThread: () => true,
        },
      },
      {
        persona: "seven_dtd_ops",
        tools: [{ name: "current_time" }, { name: "seven_dtd_get_status" }],
      }
    );

    expect(ctx.requestId.length).toBeGreaterThan(0);
    expect(ctx.guildId).toBe("g1");
    expect(ctx.effectiveChannelId).toBe("c1");
    expect(ctx.threadId).toBe("t1");
    expect(ctx.messageId).toBe("m1");
    expect(ctx.persona).toBe("seven_dtd_ops");
    expect(ctx.enabledTools).toEqual(["current_time", "seven_dtd_get_status"]);
  });
});
