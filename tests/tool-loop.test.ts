import { beforeEach, describe, expect, test, vi } from "vitest";

type MockResponse = {
  id?: string;
  output?: Array<
    | {
        type: "function_call";
        name: string;
        call_id?: string;
        input?: string;
        arguments?: string;
      }
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

const assistantProfileMocks = vi.hoisted(() => {
  return {
    runAssistantProfile: vi.fn(),
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

vi.mock("../src/tools/assistant-profile.js", async () => {
  const actual = (await vi.importActual("../src/tools/assistant-profile.js")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    runAssistantProfile: assistantProfileMocks.runAssistantProfile,
  };
});

import { queryLmStudioResponseWithTools } from "../src/discord/tool-loop.js";
import { baseTools, sevenDtdReadOnlyTools } from "../src/discord/tool-registry.js";

describe("queryLmStudioResponseWithTools", () => {
  beforeEach(() => {
    lmMocks.createResponse.mockReset();
    webResearchMocks.runWebResearchDigest.mockReset();
    assistantProfileMocks.runAssistantProfile.mockReset();
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

  test("uses options.tools and options.persona for LM request", async () => {
    lmMocks.createResponse.mockResolvedValueOnce({
      id: "r1",
      output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
    });
    const customTools = [
      {
        type: "function",
        name: "custom_tool",
        description: "custom",
        parameters: { type: "object", properties: {}, required: [] },
      },
    ];

    const out = await queryLmStudioResponseWithTools("status?", {
      persona: "seven_dtd_ops",
      tools: customTools,
    });
    expect(out).toBe("ok");

    const options = lmMocks.createResponse.mock.calls[0]?.[2] as {
      tools?: unknown[];
      instructions?: string;
    };
    expect(options.tools).toEqual(customTools);
    expect(options.instructions).toContain("7 Days to Die");
  });

  test("builds multimodal input when text and image URLs are provided", async () => {
    lmMocks.createResponse.mockResolvedValueOnce({
      id: "r1",
      output: [{ type: "message", content: [{ type: "output_text", text: "画像を確認しました" }] }],
    });

    const out = await queryLmStudioResponseWithTools({
      text: "この画像の内容を教えて",
      imageUrls: ["https://example.com/cat.png"],
    });
    expect(out).toBe("画像を確認しました");

    const firstInput = lmMocks.createResponse.mock.calls[0]?.[1] as Array<{
      role: string;
      content: Array<{ type: string; text?: string; image_url?: string }>;
    }>;
    expect(firstInput[0]?.role).toBe("user");
    expect(firstInput[0]?.content).toEqual([
      { type: "input_text", text: "この画像の内容を教えて" },
      { type: "input_image", image_url: "https://example.com/cat.png" },
    ]);
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

  test("forces assistant_profile tool call for profile question", async () => {
    assistantProfileMocks.runAssistantProfile.mockReturnValue({
      assistant_name: "suzume",
      model: "unsloth/qwen3-vl-4b-instruct",
      version: "1.0.0",
      started_at: "2026-02-07T14:00:00.000Z",
      uptime_day: 0.3,
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [{ type: "message", content: [{ type: "output_text", text: "わかりません" }] }],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "function_call", name: "assistant_profile", call_id: "ap1", input: "{}" }],
      })
      .mockResolvedValueOnce({
        id: "r3",
        output: [
          { type: "message", content: [{ type: "output_text", text: "モデルは unsloth です" }] },
        ],
      });

    const out = await queryLmStudioResponseWithTools("あなたのモデル名は？");
    expect(out).toContain("モデル");
    expect(lmMocks.createResponse).toHaveBeenCalledTimes(3);
    expect(assistantProfileMocks.runAssistantProfile).toHaveBeenCalledTimes(1);
  });

  test("does not keep returning model name for non-model latest turn in transcript", async () => {
    webResearchMocks.runWebResearchDigest.mockResolvedValue({
      query: "今日の天気",
      bullets: ["晴れ"],
      citations: [],
      errors: [],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: 1 },
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [
          {
            type: "function_call",
            name: "web_research_digest",
            call_id: "wr1",
            input: JSON.stringify({ query: "今日の天気", max_results: 3, max_pages: 2 }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "message", content: [{ type: "output_text", text: "天気の要約です" }] }],
      });

    const transcript = [
      "user: hamu: あなたのモデル名は？",
      "assistant: 現在使用しているモデルは unsloth/qwen3-vl-4b-instruct です。",
      "user: hamu: 今日の天気は？",
    ].join("\n");
    const out = await queryLmStudioResponseWithTools(transcript);
    expect(out).toBe("天気の要約です");
    expect(lmMocks.createResponse).toHaveBeenCalledTimes(2);
  });

  test("uses latest user input as fallback query for empty web_research_digest input", async () => {
    webResearchMocks.runWebResearchDigest.mockResolvedValue({
      query: "池袋のタカノフルーツパーラーの営業時間は？",
      bullets: ["営業時間は11:00から"],
      citations: [],
      errors: [],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: 1 },
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [
          {
            type: "function_call",
            name: "web_research_digest",
            call_id: "wr-empty",
            input: "",
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "message", content: [{ type: "output_text", text: "調査しました" }] }],
      });

    const transcript = [
      "assistant: こんにちは！",
      "user: hamu: あなたについての情報を教えて",
      "assistant: お名前はAdjutantです。",
      "user: hamu: 池袋のタカノフルーツパーラーの営業時間は？",
    ].join("\n");
    const out = await queryLmStudioResponseWithTools(transcript);
    expect(out).toBe("調査しました");
    expect(webResearchMocks.runWebResearchDigest).toHaveBeenCalledTimes(1);
    const firstCallArg = webResearchMocks.runWebResearchDigest.mock.calls[0]?.[0] as {
      query: string;
    };
    expect(firstCallArg.query).toBe("池袋のタカノフルーツパーラーの営業時間は？");
  });

  test("parses web_research_digest arguments field when input is empty", async () => {
    webResearchMocks.runWebResearchDigest.mockResolvedValue({
      query: "高野フルーツパーラー 池袋 開店時間",
      bullets: ["営業時間は11:00から"],
      citations: [],
      errors: [],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: 1 },
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [
          {
            type: "function_call",
            name: "web_research_digest",
            call_id: "wr-args",
            input: "",
            arguments: JSON.stringify({
              query: "高野フルーツパーラー 池袋 開店時間",
              max_results: 1,
              max_pages: 1,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
      });

    const out = await queryLmStudioResponseWithTools("池袋のタカノフルーツパーラーの営業時間は？");
    expect(out).toBe("ok");
    const firstCallArg = webResearchMocks.runWebResearchDigest.mock.calls[0]?.[0] as {
      query: string;
      maxResults: number;
      maxPages: number;
    };
    expect(firstCallArg.query).toBe("高野フルーツパーラー 池袋 開店時間");
    expect(firstCallArg.maxResults).toBe(1);
    expect(firstCallArg.maxPages).toBe(1);
  });

  test("keeps forced current_time behavior even when seven_dtd tools are enabled", async () => {
    const tools = [...baseTools(), ...sevenDtdReadOnlyTools()];
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [{ type: "message", content: [{ type: "output_text", text: "今は不明です" }] }],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "function_call", name: "current_time", call_id: "ct1", input: "{}" }],
      })
      .mockResolvedValueOnce({
        id: "r3",
        output: [{ type: "message", content: [{ type: "output_text", text: "Asia/Tokyo 22:35" }] }],
      });

    const out = await queryLmStudioResponseWithTools("今何時？", {
      persona: "seven_dtd_ops",
      tools,
    });
    expect(out).toBe("Asia/Tokyo 22:35");
    const retryOptions = lmMocks.createResponse.mock.calls[1]?.[2] as { instructions?: string };
    expect(retryOptions.instructions).toContain(
      "Do not answer directly before calling current_time."
    );
  });

  test("keeps forced web_research behavior even when seven_dtd tools are enabled", async () => {
    const tools = [...baseTools(), ...sevenDtdReadOnlyTools()];
    webResearchMocks.runWebResearchDigest.mockResolvedValue({
      query: "明日の天気",
      bullets: ["晴れ"],
      citations: [],
      errors: [],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: 1 },
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [{ type: "message", content: [{ type: "output_text", text: "わかりません" }] }],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [
          {
            type: "function_call",
            name: "web_research_digest",
            call_id: "wr1",
            input: JSON.stringify({ query: "明日の天気", max_results: 3 }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r3",
        output: [{ type: "message", content: [{ type: "output_text", text: "明日は晴れです" }] }],
      });

    const out = await queryLmStudioResponseWithTools("明日の天気は？", {
      persona: "seven_dtd_ops",
      tools,
    });
    expect(out).toBe("明日は晴れです");
    const retryOptions = lmMocks.createResponse.mock.calls[1]?.[2] as { instructions?: string };
    expect(retryOptions.instructions).toContain(
      "Do not answer directly before calling web_research_digest."
    );
  });

  test("keeps forced assistant_profile behavior even when seven_dtd tools are enabled", async () => {
    const tools = [...baseTools(), ...sevenDtdReadOnlyTools()];
    assistantProfileMocks.runAssistantProfile.mockReturnValue({
      assistant_name: "suzume",
      model: "unsloth/qwen3-vl-4b-instruct",
      version: "1.0.0",
      started_at: "2026-02-07T14:00:00.000Z",
      uptime_day: 0.3,
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [{ type: "message", content: [{ type: "output_text", text: "不明です" }] }],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "function_call", name: "assistant_profile", call_id: "ap1", input: "{}" }],
      })
      .mockResolvedValueOnce({
        id: "r3",
        output: [
          { type: "message", content: [{ type: "output_text", text: "モデルは unsloth です" }] },
        ],
      });

    const out = await queryLmStudioResponseWithTools("あなたのモデル名は？", {
      persona: "seven_dtd_ops",
      tools,
    });
    expect(out).toContain("モデル");
    const retryOptions = lmMocks.createResponse.mock.calls[1]?.[2] as { instructions?: string };
    expect(retryOptions.instructions).toContain(
      "Do not answer directly before calling assistant_profile."
    );
  });

  test("appends citation URLs when web_research_digest is used and final text has no URL", async () => {
    webResearchMocks.runWebResearchDigest.mockResolvedValue({
      query: "池袋 タカノフルーツパーラー 営業時間",
      bullets: ["営業時間は11:00〜20:00"],
      citations: [
        {
          id: "1",
          title: "池袋東武店 | タカノフルーツパーラー",
          url: "https://takano.jp/parlour/originalmenu/detail/ikebukuro-tobu/",
        },
      ],
      errors: [],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: 1 },
    });
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [
          {
            type: "function_call",
            name: "web_research_digest",
            call_id: "wr-cite-1",
            input: JSON.stringify({ query: "池袋 タカノフルーツパーラー 営業時間" }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "営業時間は11:00〜20:00です。" }],
          },
        ],
      });

    const out = await queryLmStudioResponseWithTools("池袋のタカノフルーツパーラーの営業時間は？");
    expect(out).toContain("営業時間は11:00〜20:00です。");
    expect(out).toContain("参照元:");
    expect(out).toContain("https://takano.jp/parlour/originalmenu/detail/ikebukuro-tobu/");
  });

  test("does not append citation URLs when final text already includes URL", async () => {
    webResearchMocks.runWebResearchDigest.mockResolvedValue({
      query: "池袋 タカノフルーツパーラー 営業時間",
      bullets: ["営業時間は11:00〜20:00"],
      citations: [
        {
          id: "1",
          title: "池袋東武店 | タカノフルーツパーラー",
          url: "https://takano.jp/parlour/originalmenu/detail/ikebukuro-tobu/",
        },
      ],
      errors: [],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: 1 },
    });
    const textWithUrl =
      "営業時間は11:00〜20:00です。https://takano.jp/parlour/originalmenu/detail/ikebukuro-tobu/";
    lmMocks.createResponse
      .mockResolvedValueOnce({
        id: "r1",
        output: [
          {
            type: "function_call",
            name: "web_research_digest",
            call_id: "wr-cite-2",
            input: JSON.stringify({ query: "池袋 タカノフルーツパーラー 営業時間" }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "r2",
        output: [{ type: "message", content: [{ type: "output_text", text: textWithUrl }] }],
      });

    const out = await queryLmStudioResponseWithTools("池袋のタカノフルーツパーラーの営業時間は？");
    expect(out).toBe(textWithUrl);
  });
});
