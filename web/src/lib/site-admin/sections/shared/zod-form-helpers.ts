/**
 * Pure helpers for `ZodSchemaForm` — field classification, label
 * derivation, and the AI-rewrite allow-list. Split out of the component
 * so the renderer file stays focused (and under the max-lines budget) and
 * so these stay independently testable.
 */

import type { IntrospectedField } from "./zod-introspect";

/** Top-level object / array fields render as their own collapsible group. */
export function isGroupKind(f: IntrospectedField): boolean {
  return f.kind === "object" || f.kind === "array_of_objects";
}

/**
 * Group names that are configuration / overrides rather than primary
 * content — they collapse by default and read in the de-emphasised
 * "advanced" title treatment.
 */
export const ADVANCED_GROUP_NAMES = new Set([
  "nodePresentation",
  "advanced",
  "seo",
  "meta",
  "options",
  "settings",
  "analytics",
]);

/** Friendlier titles for the worst jargon keys. */
export const GROUP_LABEL_OVERRIDES: Record<string, string> = {
  nodePresentation: "Type & color overrides",
};

/**
 * Mirrors the server-side rewrite allow-list (see ai-rewrite-action.ts).
 * Kept inlined to avoid a server-only import in the client form.
 */
export const AI_REWRITABLE_FIELD_NAMES = new Set([
  "headline",
  "subheadline",
  "eyebrow",
  "copy",
  "body",
  "intro",
  "caption",
  "footnote",
  "reassurance",
  "successMessage",
  "title",
  "category",
  "byline",
  "pullQuote",
]);

/** Strip non-string siblings + the field itself for the AI context block. */
export function pickStringSiblings(
  siblings: Record<string, unknown>,
  excludeKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(siblings)) {
    if (k === excludeKey) continue;
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export function humanizeEnumValue(value: string): string {
  // "fade-up" → "Fade up"; "5/6" → "5/6"; "edge-to-edge" → "Edge to edge"
  return value
    .replace(/[-_]/g, " ")
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/** Child field names that make the best collapsed-row summary, in order. */
const SUMMARY_PREFER = [
  "title",
  "label",
  "name",
  "heading",
  "headline",
  "question",
  "quote",
  "eyebrow",
  "caption",
];

function truncate(s: string, n = 44): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Best one-line label for a collapsed array item. */
export function deriveItemSummary(
  children: ReadonlyArray<IntrospectedField> | undefined,
  item: Record<string, unknown>,
  index: number,
): string {
  if (children) {
    for (const key of SUMMARY_PREFER) {
      const v = item[key];
      if (typeof v === "string" && v.trim()) return truncate(v.trim());
    }
    for (const child of children) {
      if (child.kind === "text" || child.kind === "textarea") {
        const v = item[child.name];
        if (typeof v === "string" && v.trim()) return truncate(v.trim());
      }
    }
  }
  return `Item ${index + 1}`;
}
