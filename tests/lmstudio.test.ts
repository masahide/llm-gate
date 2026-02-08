import { describe, expect, test } from "vitest";
import { buildResponseRequestBody, extractOutputText } from "../src/lmstudio.js";
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

describe("buildResponseRequestBody", () => {
  test("builds minimum request body with defaults", () => {
    const body = buildResponseRequestBody(
      { model: "test-model", baseUrl: "http://localhost:1234" },
      "hello"
    );
    expect(body).toEqual({
      model: "test-model",
      max_output_tokens: 1024,
      input: "hello",
    });
  });

  test("includes optional fields when provided", () => {
    const body = buildResponseRequestBody(
      { model: "test-model", baseUrl: "http://localhost:1234" },
      [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
      {
        previousResponseId: "resp_1",
        temperature: 0.2,
        instructions: "Be concise",
        maxOutputTokens: 777,
        tools: [
          {
            type: "function",
            name: "current_time",
            description: "time",
            parameters: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        ],
      }
    );

    expect(body).toEqual({
      model: "test-model",
      max_output_tokens: 777,
      input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
      previous_response_id: "resp_1",
      temperature: 0.2,
      instructions: "Be concise",
      tools: [
        {
          type: "function",
          name: "current_time",
          description: "time",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
    });
  });
});
