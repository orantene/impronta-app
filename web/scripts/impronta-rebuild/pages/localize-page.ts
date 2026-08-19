/**
 * Turn an English page tree into another locale's, by copy map.
 *
 * Extracted from `home-es.ts` when the division pages needed the same thing.
 * Two copies of this walk would drift in exactly the way that matters: one
 * would learn about a new text-bearing prop and the other would not, and the
 * page whose walk was stale would ship English inside a Spanish page with no
 * error anywhere.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * Props whose values a VISITOR reads.
 *
 * Deliberately narrow. Ids, slugs, image slots, CSS and config keys are also
 * strings, and "translating" one breaks the page rather than localizing it.
 */
export const PAGE_TEXT_PROPS: ReadonlySet<string> = new Set([
  "text",
  "label",
  "title",
  "subtitle",
  "heading",
  "headline",
  "subheadline",
  "eyebrow",
  "eyebrowText",
  "line1",
  "line2",
  "sub",
  "footnote",
  "body",
  "quote",
  "attribution",
  "value",
  "caption",
  "alt",
  "seeAllLabel",
  "emptyStateText",
  "placeholder",
  "note",
]);

/** A URL, not prose — prefixed for the locale rather than translated. */
export function isHrefValue(value: string): boolean {
  return /^https?:|^mailto:|^tel:|^#|^\//.test(value);
}

export function localizeHref(href: string, locale: string): string {
  if (!href.startsWith("/")) return href;
  const prefix = `/${locale}`;
  if (href === prefix || href.startsWith(`${prefix}/`)) return href;
  return href === "/" ? prefix : `${prefix}${href}`;
}

export interface LocalizeOptions {
  locale: string;
  copy: Record<string, string>;
  /** Namespaces node ids so two locales of one page can never collide. */
  idPrefix: string;
}

export function buildLocalizedTree(
  source: ReadonlyArray<BuilderNode>,
  options: LocalizeOptions,
): BuilderNode[] {
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((entry) => walk(entry));
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && key) {
        if (key === "href") return localizeHref(value, options.locale);
        if (PAGE_TEXT_PROPS.has(key) && value.trim() && !isHrefValue(value)) {
          // An unmapped string passes through UNCHANGED rather than throwing:
          // the build failing belongs in a test with the full list, not in a
          // seeder that dies on the first missing sentence.
          return options.copy[value] ?? value;
        }
        if (key === "id") {
          return value.startsWith(options.idPrefix)
            ? value
            : `${options.idPrefix}${value}`;
        }
      }
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, k);
    }
    return out;
  };
  return walk(source) as BuilderNode[];
}

/** Every visitor-facing string in a tree — the input to the parity test. */
export function collectVisitorText(nodes: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => walk(entry));
    if (!value || typeof value !== "object") {
      if (
        typeof value === "string" &&
        key &&
        PAGE_TEXT_PROPS.has(key) &&
        value.trim() &&
        !isHrefValue(value)
      ) {
        out.push(value);
      }
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  walk(nodes);
  return out;
}
