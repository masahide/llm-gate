import { describe, expect, test } from "vitest";
import { formatTranscript } from "../src/context/transcript.js";

describe("formatTranscript", () => {
  test("formats turns as role-prefixed lines", () => {
    const transcript = formatTranscript([
      { role: "user", text: "alice: 予定を教えて" },
      { role: "assistant", text: "了解しました" },
    ]);

    expect(transcript).toBe("user: alice: 予定を教えて\nassistant: 了解しました");
  });
});
