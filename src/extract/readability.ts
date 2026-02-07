import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export type ExtractedDocument = {
  title: string;
  text: string;
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractReadableDocument(html: string, url: string): ExtractedDocument {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = normalize(article?.title ?? "");
  const text = normalize(article?.textContent ?? "");

  if (text.length > 0) {
    return { title: title || "untitled", text };
  }

  const fallbackText = normalize(dom.window.document.body?.textContent ?? "");
  return { title: title || "untitled", text: fallbackText };
}
