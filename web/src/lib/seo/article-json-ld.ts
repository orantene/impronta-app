/**
 * Article structured data: schema.org Article JSON-LD.
 *
 * Mirrors `faq-json-ld.ts`. Built from the same fields the article page
 * renders, so the markup cannot describe something a reader can't see.
 *
 * `datePublished` comes from the content model and is a real publication date,
 * never generated at request time: a date that moves on every render is worse
 * than no date at all.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

export interface ArticleJsonLdInput {
  /** Absolute canonical URL of the article. */
  pageUrl: string;
  headline: string;
  description: string;
  /** ISO date (YYYY-MM-DD). */
  datePublished: string;
  /** Absolute URL of the lead image, when there is one. */
  imageUrl?: string | null;
  /** "en" | "es", matches the page's resolved locale. */
  inLanguage?: string | null;
  /** Publishing organisation, e.g. "Tulala". */
  publisherName: string;
  publisherUrl: string;
}

/** Returns null (caller skips emitting) when the required fields are missing. */
export function buildArticleJsonLd(
  input: ArticleJsonLdInput,
): Record<string, JsonValue> | null {
  const headline = input.headline?.trim();
  const description = input.description?.trim();
  if (!headline || !description || !input.pageUrl) return null;

  const obj: Record<string, JsonValue> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.pageUrl },
    url: input.pageUrl,
    author: {
      "@type": "Organization",
      name: input.publisherName,
      url: input.publisherUrl,
    },
    publisher: {
      "@type": "Organization",
      name: input.publisherName,
      url: input.publisherUrl,
    },
  };

  if (input.datePublished) obj.datePublished = input.datePublished;
  if (input.imageUrl) obj.image = input.imageUrl;
  if (input.inLanguage) obj.inLanguage = input.inLanguage;

  return obj;
}

export function articleJsonLdToString(
  obj: Record<string, JsonValue> | null,
): string {
  if (!obj) return "";
  // `<` escaped so the payload can never close the surrounding script tag.
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
