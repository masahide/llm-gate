import { afterEach, describe, expect, test } from "vitest";
import {
  buildToolLoopOptionsForMessage,
  resolvePersonaForContext,
} from "../src/discord/context-tools.js";

describe("context-tools", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("resolvePersonaForContext returns seven_dtd_ops only for allowed context", () => {
    expect(resolvePersonaForContext(true)).toBe("seven_dtd_ops");
    expect(resolvePersonaForContext(false)).toBe("default");
  });

  test("buildToolLoopOptionsForMessage injects seven_dtd tools only for allowed channel", () => {
    process.env.ALLOWED_GUILD_IDS = "g1";
    process.env.ALLOWED_CHANNEL_IDS = "c-parent";
    process.env.SEVEN_DTD_ENABLE_WRITE_TOOLS = "false";

    const allowed = buildToolLoopOptionsForMessage({
      guildId: "g1",
      channel: {
        id: "thread-1",
        parentId: "c-parent",
        isThread: () => true,
      },
    });

    const denied = buildToolLoopOptionsForMessage({
      guildId: "g1",
      channel: {
        id: "c-other",
        isThread: () => false,
      },
    });

    const allowedNames = (allowed.tools ?? [])
      .map((t) => (t && typeof t === "object" && "name" in t ? (t as { name?: string }).name : ""))
      .filter(Boolean);
    const deniedNames = (denied.tools ?? [])
      .map((t) => (t && typeof t === "object" && "name" in t ? (t as { name?: string }).name : ""))
      .filter(Boolean);

    expect(allowed.persona).toBe("seven_dtd_ops");
    expect(allowedNames).toContain("seven_dtd_get_status");
    expect(denied.persona).toBe("default");
    expect(deniedNames).not.toContain("seven_dtd_get_status");
  });
});
