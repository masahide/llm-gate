import path from "node:path";
import { FileCache } from "../cache/file-cache.js";
import { PageFetcher } from "../web/fetch-page.js";
import { BraveSearchClient, type BraveSearchResult } from "../web/brave-search.js";

export type WebResearchDigestParams = {
  query: string;
  maxResults: number;
  maxPages: number;
  focus: string;
};

export type WebResearchCitation = {
  id: string;
  title: string;
  url: string;
  snippet?: string;
};

export type WebResearchErrorCode =
  | "brave_error"
  | "fetch_timeout"
  | "fetch_too_large"
  | "invalid_url"
  | "ssrf_blocked"
  | "extract_failed";

export type WebResearchError = {
  code: WebResearchErrorCode;
  message: string;
  url?: string;
};

export type WebResearchDigestOutput = {
  query: string;
  bullets: string[];
  citations: WebResearchCitation[];
  errors: WebResearchError[];
  meta: {
    cache_hit_search: boolean;
    cache_hit_pages: number;
    elapsed_ms: number;
  };
};

type WebResearchDeps = {
  searchClient: BraveSearchClient;
  pageFetcher: PageFetcher;
  cache: FileCache;
  searchTtlSeconds: number;
  pageTtlSeconds: number;
  now: () => number;
};

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_PAGES = 3;
const MAX_BULLETS = 8;
const MAX_BULLET_CHARS = 240;
const MAX_SNIPPET_CHARS = 280;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toErrorCode(err: unknown): WebResearchErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fetch_timeout")) return "fetch_timeout";
  if (msg.includes("fetch_too_large")) return "fetch_too_large";
  if (msg.includes("ssrf_blocked")) return "ssrf_blocked";
  if (msg.includes("invalid_url")) return "invalid_url";
  if (msg.includes("extract")) return "extract_failed";
  return "brave_error";
}

function pickSummarySentence(text: string, query: string, focus: string): string {
  const normalized = normalize(text);
  if (!normalized) return "";
  const queryTerms = normalize(`${query} ${focus}`)
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= 2);
  const candidates = normalized.split(/(?<=[。.!?])\s+/).filter((line) => line.length > 0);

  let best = candidates[0] ?? normalized;
  let bestScore = -1;
  for (const row of candidates) {
    const lower = row.toLowerCase();
    const score = queryTerms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return truncate(normalize(best), MAX_BULLET_CHARS);
}

export const webResearchDigestTool = {
  type: "function" as const,
  name: "web_research_digest",
  description:
    "Uses Brave Web Search and page extraction to return research highlights (bullets) and citations in JSON.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to investigate (1-300 characters).",
      },
      max_results: {
        type: "number",
        description: "Number of search results to fetch (1-8).",
      },
      max_pages: {
        type: "number",
        description: "Number of pages to fetch and extract content from (1-5).",
      },
      focus: {
        type: "string",
        description: "Optional focus or angle for summarization (0-200 characters).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export function parseWebResearchDigestParams(input?: string): WebResearchDigestParams {
  const fallback: WebResearchDigestParams = {
    query: "",
    maxResults: DEFAULT_MAX_RESULTS,
    maxPages: DEFAULT_MAX_PAGES,
    focus: "",
  };
  if (!input) return fallback;
  try {
    const parsed = JSON.parse(input) as {
      query?: string;
      max_results?: number;
      max_pages?: number;
      focus?: string;
    };
    const query = typeof parsed.query === "string" ? normalize(parsed.query) : "";
    const focus = typeof parsed.focus === "string" ? truncate(normalize(parsed.focus), 200) : "";
    const maxResultsRaw = typeof parsed.max_results === "number" ? parsed.max_results : undefined;
    const maxPagesRaw = typeof parsed.max_pages === "number" ? parsed.max_pages : undefined;
    const maxResults =
      typeof maxResultsRaw === "number"
        ? Math.min(Math.max(Math.floor(maxResultsRaw), 1), 8)
        : DEFAULT_MAX_RESULTS;
    const maxPages =
      typeof maxPagesRaw === "number"
        ? Math.min(Math.max(Math.floor(maxPagesRaw), 1), 5)
        : DEFAULT_MAX_PAGES;
    return {
      query: truncate(query, 300),
      maxResults,
      maxPages,
      focus,
    };
  } catch {
    return fallback;
  }
}

function createDeps(): WebResearchDeps {
  const cacheDir = process.env.WEB_CACHE_DIR ?? path.join(process.cwd(), ".cache", "web-research");
  const apiKey = process.env.BRAVE_API_KEY ?? "";
  return {
    searchClient: new BraveSearchClient({
      apiKey,
      ...(process.env.BRAVE_API_BASE_URL ? { baseUrl: process.env.BRAVE_API_BASE_URL } : {}),
      timeoutMs: Number(process.env.WEB_FETCH_TIMEOUT_MS ?? "10000"),
    }),
    pageFetcher: new PageFetcher({
      timeoutMs: Number(process.env.WEB_FETCH_TIMEOUT_MS ?? "10000"),
      maxBytes: Number(process.env.WEB_FETCH_MAX_BYTES ?? "1000000"),
    }),
    cache: new FileCache(cacheDir),
    searchTtlSeconds: Number(process.env.WEB_SEARCH_TTL_SECONDS ?? "900"),
    pageTtlSeconds: Number(process.env.WEB_PAGE_TTL_SECONDS ?? "900"),
    now: () => Date.now(),
  };
}

async function getSearchResults(
  deps: WebResearchDeps,
  params: WebResearchDigestParams
): Promise<{ rows: BraveSearchResult[]; cacheHit: boolean }> {
  const cacheKey = JSON.stringify({ query: params.query, maxResults: params.maxResults });
  const cached = await deps.cache.get<BraveSearchResult[]>("search", cacheKey);
  if (cached) return { rows: cached, cacheHit: true };

  const rows = await deps.searchClient.search(params.query, params.maxResults);
  await deps.cache.set("search", cacheKey, rows, deps.searchTtlSeconds);
  return { rows, cacheHit: false };
}

async function getPageText(
  deps: WebResearchDeps,
  url: string
): Promise<{ title: string; text: string; cacheHit: boolean }> {
  const cached = await deps.cache.get<{ title: string; text: string }>("pages", url);
  if (cached) return { ...cached, cacheHit: true };

  const page = await deps.pageFetcher.fetchText(url);
  const value = { title: page.title, text: page.text };
  await deps.cache.set("pages", url, value, deps.pageTtlSeconds);
  return { ...value, cacheHit: false };
}

export async function runWebResearchDigest(
  params: WebResearchDigestParams,
  overrides?: Partial<WebResearchDeps>
): Promise<WebResearchDigestOutput> {
  const base = createDeps();
  const deps: WebResearchDeps = {
    ...base,
    ...overrides,
  };
  const started = deps.now();
  const errors: WebResearchError[] = [];
  const bullets: string[] = [];
  const citations: WebResearchCitation[] = [];
  let cacheHitSearch = false;
  let cacheHitPages = 0;

  if (!params.query) {
    return {
      query: "",
      bullets: [],
      citations: [],
      errors: [{ code: "invalid_url", message: "query is required" }],
      meta: { cache_hit_search: false, cache_hit_pages: 0, elapsed_ms: deps.now() - started },
    };
  }

  let searchRows: BraveSearchResult[] = [];
  try {
    const search = await getSearchResults(deps, params);
    searchRows = search.rows;
    cacheHitSearch = search.cacheHit;
  } catch (error) {
    errors.push({
      code: "brave_error",
      message: truncate(error instanceof Error ? error.message : String(error), 200),
    });
  }

  for (const row of searchRows.slice(0, params.maxPages)) {
    try {
      const page = await getPageText(deps, row.url);
      if (page.cacheHit) cacheHitPages += 1;
      const id = String(citations.length + 1);
      const snippet = row.snippet ? truncate(normalize(row.snippet), MAX_SNIPPET_CHARS) : undefined;
      citations.push({
        id,
        title: truncate(normalize(page.title || row.title || "untitled"), 120),
        url: row.url,
        ...(snippet ? { snippet } : {}),
      });
      const summary = pickSummarySentence(page.text, params.query, params.focus);
      if (summary) bullets.push(`${summary} [${id}]`);
      if (bullets.length >= MAX_BULLETS || citations.length >= 8) break;
    } catch (error) {
      errors.push({
        code: toErrorCode(error),
        message: truncate(error instanceof Error ? error.message : String(error), 200),
        url: row.url,
      });
    }
  }

  return {
    query: params.query,
    bullets: bullets.slice(0, MAX_BULLETS),
    citations: citations.slice(0, 8),
    errors: errors.slice(0, 8),
    meta: {
      cache_hit_search: cacheHitSearch,
      cache_hit_pages: cacheHitPages,
      elapsed_ms: Math.max(0, deps.now() - started),
    },
  };
}
