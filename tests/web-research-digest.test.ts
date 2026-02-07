import { describe, expect, test } from "vitest";
import {
  parseWebResearchDigestParams,
  runWebResearchDigest,
} from "../src/tools/web-research-digest.js";

describe("web-research-digest", () => {
  test("parses params with bounds", () => {
    const params = parseWebResearchDigestParams(
      JSON.stringify({
        query: " latest ai news ",
        max_results: 99,
        max_pages: 0,
        focus: "  safety  ",
      })
    );

    expect(params).toEqual({
      query: "latest ai news",
      maxResults: 8,
      maxPages: 1,
      focus: "safety",
    });
  });

  test("builds digest from search and page fetch", async () => {
    const now = 10_000;
    const output = await runWebResearchDigest(
      {
        query: "OpenAI API",
        maxResults: 2,
        maxPages: 2,
        focus: "",
      },
      {
        now: () => now,
        cache: {
          get: async () => null,
          set: async () => {},
        } as never,
        searchClient: {
          search: async () => [
            { title: "Doc", url: "https://example.com/doc", snippet: "official docs" },
            { title: "Blog", url: "https://example.com/blog", snippet: "release note" },
          ],
        } as never,
        pageFetcher: {
          fetchText: async (url: string) => ({
            finalUrl: url,
            contentType: "text/html",
            title: url.includes("doc") ? "API Doc" : "Blog Post",
            text: url.includes("doc")
              ? "OpenAI API は認証とエンドポイント設計が重要です。"
              : "最近の更新では推論性能が改善されました。",
          }),
        } as never,
      }
    );

    expect(output.query).toBe("OpenAI API");
    expect(output.bullets.length).toBeGreaterThan(0);
    expect(output.citations.length).toBe(2);
    expect(output.errors).toEqual([]);
  });
});
