import test from "node:test";
import assert from "node:assert/strict";
import { extractOutputText } from "../src/lmstudio.js";

test("merge output_text fragments", () => {
  const payload = {
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

  assert.strictEqual(extractOutputText(payload), "hello world");
});
