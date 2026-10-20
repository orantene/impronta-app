/**
 * F1 (TUL-1273 deferred): the "Service:" section of a talent's AI search document.
 *
 * Pure and deterministic. D-10a (listing rule): an offering is LISTED when it is
 * published AND approved AND (public OR on_request). An on_request offering is
 * listed with NO price: its text is written with every amount stripped. Never
 * agency_only / pending / rejected / draft / archived; a row without the gate
 * fields fails CLOSED. The loader filters the same way in SQL; this second check
 * keeps a future caller from leaking a private service into the embedding.
 * (Selling stays D-10, `isGuestSellableOffering`: public only.)
 */

import { isSellable } from "@/lib/offerings/sellable";

/** Most services written into one document (the embedding stays focused). */
export const AI_DOC_OFFERINGS_MAX = 12;
export const AI_DOC_OFFERING_TITLE_MAX = 120;
export const AI_DOC_OFFERING_CATEGORY_MAX = 60;
export const AI_DOC_OFFERING_DESCRIPTION_MAX = 240;
/** Hard ceiling for the whole section, newlines included. */
export const AI_DOC_OFFERINGS_SECTION_MAX = 2400;

export type AiSearchDocumentOffering = {
  id?: string | null;
  title: string;
  category?: string | null;
  description?: string | null;
  sortOrder?: number | null;
  status?: string | null;
  moderation_state?: string | null;
  visibility?: string | null;
};

/** D-10a: published + approved + (public | on_request). */
export function isDirectoryListableOffering(row: {
  status?: unknown;
  moderation_state?: unknown;
  visibility?: unknown;
} | null | undefined): boolean {
  return isSellable(row, "guest_request");
}

/**
 * Removes price text: an optional "from / desde / a partir de" lead-in, a
 * currency sign, the amount and a currency word, then any digit left over.
 */
export function stripPriceText(value: string): string {
  return value
    .replace(
      /(?:\b(?:from|starting at|desde|a partir de)\s+)?(?:[$€£]|\b(?:MXN|USD|EUR|US\$|MX\$)\s*)?\s*\d[\d.,]*\s*(?:k\b)?(?:\s*(?:MXN|USD|EUR|pesos?|d[oó]lares|dollars?)\b)?/gi,
      " ",
    )
    .replace(/\d+/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: string | null | undefined, max: number): string {
  const t = (value ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 3).trimEnd()}...`;
}

function compareOfferings(a: AiSearchDocumentOffering, b: AiSearchDocumentOffering): number {
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  const t = a.title.localeCompare(b.title, "en");
  if (t !== 0) return t;
  return (a.id ?? "").localeCompare(b.id ?? "", "en");
}

function formatOffering(o: AiSearchDocumentOffering): string | null {
  // On request: listed, never priced. Strip before truncating so a cut cannot
  // leave half an amount behind.
  const text = (v: string | null | undefined) =>
    o.visibility === "on_request" ? stripPriceText(v ?? "") : v;
  const title = clean(text(o.title), AI_DOC_OFFERING_TITLE_MAX);
  if (!title) return null;
  const category = clean(text(o.category), AI_DOC_OFFERING_CATEGORY_MAX);
  const description = clean(text(o.description), AI_DOC_OFFERING_DESCRIPTION_MAX);
  let line = `Service: ${title}`;
  if (category) line += ` (${category})`;
  if (description) line += `: ${description}`;
  return line;
}

/** One "Service: ..." line per listable offering (D-10a), sorted and capped. */
export function buildOfferingsSection(offerings: AiSearchDocumentOffering[] | null | undefined): string[] {
  const rows = (offerings ?? []).filter((o) => isDirectoryListableOffering(o)).sort(compareOfferings);
  const out: string[] = [];
  let used = 0;
  for (const row of rows) {
    if (out.length >= AI_DOC_OFFERINGS_MAX) break;
    const line = formatOffering(row);
    if (!line) continue;
    const cost = line.length + (out.length > 0 ? 1 : 0);
    if (used + cost > AI_DOC_OFFERINGS_SECTION_MAX) break;
    out.push(line);
    used += cost;
  }
  return out;
}
