import { describe, expect, test } from "vitest";
import { extractOutputText } from "../src/lmstudio.js";
import type { ResponsesResponse } from "../src/lmstudio.js";

describe("extractOutputText", () => {
  test("merges output_text fragments into a single string", () => {
    const payload: ResponsesResponse = {
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "hello" },
            { type: "output_text", text: " " },
          ],
        },
        {
          type: "message",
          content: [{ type: "output_text", text: "world" }],
        },
      ],
    };

    expect(extractOutputText(payload)).toBe("hello world");
  });
});
