import { beforeEach, describe, expect, test, vi } from "vitest";

type MockResponse = {
  id?: string;
  output?: Array<
    | { type: "function_call"; name: string; call_id?: string; input?: string }
    | { type: "message"; content: Array<{ type: "output_text"; text: string }> }
  >;
};

const lmMocks = vi.hoisted(() => {
  return {
    createResponse: vi.fn(),
  };
});

const webResearchMocks = vi.hoisted(() => {
  return {
    runWebResearchDigest: vi.fn(),
  };
});

vi.mock("../src/lmstudio.js", () => ({
  createResponse: lmMocks.createResponse,
  extractOutputText: (resp: MockResponse) => {
    const out = resp.output ?? [];
    return out
      .filter(
        (
          item
        ): item is { type: "message"; content: Array<{ type: "output_text"; text: string }> } =>
          item.type === "message"
      )
      .flatMap((message) => message.content)
      .filter((chunk) => chunk.type === "output_text")
      .map((chunk) => chunk.text)
      .join("");
  },
}));

vi.mock("../src/tools/web-research-digest.js", async () => {
  const actual = (await vi.importActual("../src/tools/web-research-digest.js")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    runWebResearchDigest: webResearchMocks.runWebResearchDigest,
  };
});

import { queryLmStudioResponseWithTools } from "../src/discord/tool-loop.js";

describe("queryLmStudioResponseWithTools", () => {
  beforeEach(() => {
    lmMocks.createResponse.mockReset();
    webResearchMocks.runWebResearchDigest.mockReset();
  });

  test("resolves current_time tool call and returns follow-up text", async () => {
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [
          {
            type: "function_call",
            name: "current_time",
            call_id: "c1",
            input: JSON.stringify({ timezone: "Asia/Tokyo" }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "message", content: [{ type: "output_text", text: "tool done" }] }],
      });

    const out = await queryLmStudioResponseWithTools("time?");
    expect(out).toBe("tool done");

    expect(lmMocks.createResponse).toHaveBeenCalledTimes(2);
    const secondInput = lmMocks.createResponse.mock.calls[1]?.[1] as Array<{
      type: string;
      call_id: string;
      output: string;
    }>;
    expect(secondInput[0]?.type).toBe("function_call_output");
    expect(secondInput[0]?.call_id).toBe("c1");
    expect(secondInput[0]?.output).toContain("Asia/Tokyo");
  });

  test("stops when tool-call chain exceeds maxLoops", async () => {
    lmMocks.createResponse.mockResolvedValue({
      id: "rx",
      output: [{ type: "function_call", name: "unknown_tool", call_id: "u1", input: "{}" }],
    });

    const out = await queryLmStudioResponseWithTools("loop", { maxLoops: 2 });
    expect(out).toBe("調査に時間がかかっています。もう一度試してください。");
    expect(lmMocks.createResponse).toHaveBeenCalledTimes(3);
  });

  test("forces current_time tool call for time question before final answer", async () => {
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [{ type: "message", content: [{ type: "output_text", text: "今は朝です" }] }],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "function_call", name: "current_time", call_id: "ct1", input: "{}" }],
      })
      .mockResolvedValueOnce({
        id: "r3",
        output: [{ type: "message", content: [{ type: "output_text", text: "Asia/Tokyo 22:35" }] }],
      });

    const out = await queryLmStudioResponseWithTools("今何時？");
    expect(out).toBe("Asia/Tokyo 22:35");
    expect(lmMocks.createResponse).toHaveBeenCalledTimes(3);
    const retryOptions = lmMocks.createResponse.mock.calls[1]?.[2] as { instructions?: string };
    expect(retryOptions.instructions).toContain(
      "Do not answer directly before calling current_time."
    );
  });
});
