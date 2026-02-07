import { extractReadableDocument } from "../extract/readability.js";
import { validatePublicHttpUrl } from "../security/url-validator.js";

export type FetchPageResult = {
  finalUrl: string;
  contentType: string;
  title: string;
  text: string;
};

export type PageFetcherOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

export class PageFetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(opts: PageFetcherOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 10000;
    this.maxBytes = opts.maxBytes ?? 1_000_000;
    this.maxRedirects = opts.maxRedirects ?? 5;
  }

  private async readBodyText(res: Response): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return "";

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const row = await reader.read();
      if (row.done) break;
      if (!row.value) continue;
      total += row.value.byteLength;
      if (total > this.maxBytes) {
        throw new Error("fetch_too_large");
      }
      chunks.push(row.value);
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8").decode(merged);
  }

  async fetchText(url: string): Promise<FetchPageResult> {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const validated = await validatePublicHttpUrl(currentUrl);
      if (!validated.ok) throw new Error("ssrf_blocked");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      let res: Response;
      try {
        res = await fetch(validated.normalizedUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "llm-gate/1.0 (+https://example.local)",
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("fetch_timeout");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error("redirect_without_location");
        currentUrl = new URL(location, validated.normalizedUrl).toString();
        continue;
      }

      if (!res.ok) throw new Error(`fetch_http_${res.status}`);
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new Error("unsupported_content_type");
      }

      const body = await this.readBodyText(res);
      if (contentType.includes("text/html")) {
        const extracted = extractReadableDocument(body, validated.normalizedUrl);
        return {
          finalUrl: validated.normalizedUrl,
          contentType,
          title: extracted.title,
          text: extracted.text,
        };
      }

      const text = body.replace(/\s+/g, " ").trim();
      return {
        finalUrl: validated.normalizedUrl,
        contentType,
        title: "untitled",
        text,
      };
    }

    throw new Error("too_many_redirects");
  }
}
