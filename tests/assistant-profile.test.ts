import { describe, expect, test } from "vitest";
import { runAssistantProfile } from "../src/tools/assistant-profile.js";

describe("assistant_profile tool", () => {
  test("returns required profile fields", () => {
    const profile = runAssistantProfile();
    expect(profile.assistant_name.length).toBeGreaterThan(0);
    expect(profile.model.length).toBeGreaterThan(0);
    expect(profile.version.length).toBeGreaterThan(0);
    expect(typeof profile.started_at).toBe("string");
    expect(typeof profile.uptime_day).toBe("number");
  });
});
