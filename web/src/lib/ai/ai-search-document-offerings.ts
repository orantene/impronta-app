/**
 * F1 (TUL-1273 deferred): the "Service:" section of a talent's AI search document.
 *
 * Pure and deterministic. D-10 (guest-sellable rule): only offerings that are
 * published AND approved AND public are written; a row without those gate
 * fields fails CLOSED. The loader filters the same way in SQL; this second
 * check keeps a future caller from leaking a private service into the embedding.
 */

import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";

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
  const title = clean(o.title, AI_DOC_OFFERING_TITLE_MAX);
  if (!title) return null;
  const category = clean(o.category, AI_DOC_OFFERING_CATEGORY_MAX);
  const description = clean(o.description, AI_DOC_OFFERING_DESCRIPTION_MAX);
  let line = `Service: ${title}`;
  if (category) line += ` (${category})`;
  if (description) line += `: ${description}`;
  return line;
}

/** One "Service: ..." line per guest-sellable offering, sorted and capped. */
export function buildOfferingsSection(offerings: AiSearchDocumentOffering[] | null | undefined): string[] {
  const rows = (offerings ?? []).filter((o) => isGuestSellableOffering(o)).sort(compareOfferings);
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
