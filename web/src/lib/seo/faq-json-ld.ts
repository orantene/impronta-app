/**
 * FAQ page structured data: schema.org FAQPage JSON-LD.
 *
 * PR-FAQOG. Builds FAQPage markup from the SAME Q&A array the /faq page
 * renders (`getMarketingCopy(locale).faq.items`), never a separate copy,
 * so the schema can't drift from what's actually on the page. Google (and
 * AI answer engines) only credit FAQPage markup that matches visible
 * content; this generator has no path to invent a question.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

function compact<T extends Record<string, JsonValue | undefined>>(o: T): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export interface FaqJsonLdInput {
  /** Absolute canonical URL of the FAQ page, e.g. `https://tulala.digital/faq`. */
  pageUrl: string;
  /** The exact array the page renders: `getMarketingCopy(locale).faq.items`. */
  items: { q: string; a: string }[];
  /** "en" | "es", matches the page's resolved locale. */
  inLanguage?: string | null;
}

/** Returns null (caller skips emitting) if there are no usable Q&A pairs,
 *  never emits an empty FAQPage, which Google flags as invalid. */
export function buildFaqPageJsonLd(input: FaqJsonLdInput): Record<string, JsonValue> | null {
  const items = input.items
    .map((it) => ({ q: it.q?.trim() ?? "", a: it.a?.trim() ?? "" }))
    .filter((it) => it.q && it.a);
  if (items.length === 0) return null;

  return compact({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": input.pageUrl,
    url: input.pageUrl,
    inLanguage: input.inLanguage?.trim() ?? null,
    mainEntity: items.map((it) =>
      compact({
        "@type": "Question",
        name: it.q,
        acceptedAnswer: compact({
          "@type": "Answer",
          text: it.a,
        }),
      }),
    ),
  });
}

/** Stable stringify for the `<script>` tag, mirrors `jsonLdToString` in
 *  `talent-json-ld.ts`; kept local so this file has no cross-module type
 *  coupling. */
export function faqJsonLdToString(obj: Record<string, JsonValue> | null): string {
  if (!obj) return "";
  return JSON.stringify(obj);
}
