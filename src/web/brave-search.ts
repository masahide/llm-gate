export type BraveSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type BraveSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class BraveSearchClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: BraveSearchClientOptions) {
    this.baseUrl = opts.baseUrl ?? "https://api.search.brave.com";
    this.timeoutMs = opts.timeoutMs ?? 10000;
  }

  private isDebugEnabled(): boolean {
    return process.env.DEBUG_WEB_RESEARCH === "true" || process.env.DEBUG_ASSISTANT === "true";
  }

  private debugLog(message: string, payload: Record<string, unknown>): void {
    if (!this.isDebugEnabled()) return;
    console.debug(message, payload);
  }

  async search(query: string, maxResults: number): Promise<BraveSearchResult[]> {
    const count = Math.min(Math.max(maxResults, 1), 20);
    const endpoint =
      `${this.baseUrl}/res/v1/web/search` +
      `?q=${encodeURIComponent(query)}` +
      `&count=${count}` +
      "&safesearch=moderate";
    this.debugLog("[web debug] brave search request", {
      query,
      count,
      endpoint,
      timeoutMs: this.timeoutMs,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.opts.apiKey,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`brave timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text();
      this.debugLog("[web debug] brave search error response", {
        status: res.status,
        statusText: res.statusText,
        body: body.slice(0, 500),
      });
      throw new Error(`brave ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const rows = data.web?.results ?? [];
    const normalized = rows
      .map((row) => ({
        title: (row.title ?? "").trim(),
        url: (row.url ?? "").trim(),
        snippet: (row.description ?? "").trim(),
      }))
      .filter((row) => row.url.length > 0)
      .slice(0, count);

    this.debugLog("[web debug] brave search response", {
      status: res.status,
      resultCount: normalized.length,
      topResults: normalized.slice(0, 3).map((row) => ({
        title: row.title,
        url: row.url,
      })),
    });
    return normalized;
  }
}
