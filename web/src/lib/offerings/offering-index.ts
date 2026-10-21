/**
 * offering-index.ts · the pure half of mounting `resolveOfferingPath` on the real routes
 * (TUL-1594). `buildOfferingIndex` turns the rows the server loader read into the
 * `OfferingIndex` the resolver wants; `resolveOldServiceSlug` answers "which offering did this
 * old or current slug belong to?" through the resolver, so the routes can 301 to the page
 * they already render. No request, no database.
 */
import {
  catalogWordForLocale,
  resolveOfferingPath,
  type OfferingHostKind,
  type OfferingIndex,
} from "./offering-paths";

export type OfferingSlugDbRow = { offering_id: string; locale: string; slug: string; is_current: boolean };

const compactId = (id: string) => id.replace(/-/g, "").toLowerCase();

export function buildOfferingIndex(input: {
  rows: readonly OfferingSlugDbRow[];
  /** Every offering id in the owner's scope (so an id8 resolves even with no slug rows). */
  offeringIds: readonly string[];
  primaryLocale: string;
}): OfferingIndex {
  const bySlug = new Map<string, { offeringId: string; current: boolean }>();
  const current = new Map<string, string>();
  for (const r of input.rows) {
    const key = `${r.locale}\u0000${r.slug}`;
    const prev = bySlug.get(key);
    // A current row wins over a history row that claims the same slug.
    if (!prev || (r.is_current && !prev.current)) bySlug.set(key, { offeringId: r.offering_id, current: r.is_current });
    if (r.is_current) current.set(`${r.offering_id}\u0000${r.locale}`, r.slug);
  }
  const ids = [...new Set([...input.offeringIds, ...input.rows.map((r) => r.offering_id)])].sort();
  return {
    findBySlug: (locale, slug) => bySlug.get(`${locale}\u0000${slug}`) ?? null,
    findByIdPrefix: (id8) => ids.find((id) => compactId(id).startsWith(id8.toLowerCase())) ?? null,
    currentSlug: (id, locale) => current.get(`${id}\u0000${locale}`) ?? null,
    primarySlug: (id) => current.get(`${id}\u0000${input.primaryLocale}`) ?? null,
    nonPageTarget: () => null,
  };
}

/**
 * The offering an old (history) or current slug belongs to, or null. Goes through
 * `resolveOfferingPath` with a synthetic `/<word>/<slug>` path in `locale`. The routes then
 * redirect to the page they already render for that offering, so a resolver answer never
 * points at a URL the route cannot serve.
 */
export function resolveOldServiceSlug(input: {
  slug: string;
  locale: string;
  publicLocales: readonly string[];
  hostKind: OfferingHostKind;
  index: OfferingIndex;
}): string | null {
  const settings = { defaultLocale: input.locale, publicLocales: input.publicLocales.length ? input.publicLocales : [input.locale] };
  const res = resolveOfferingPath({
    pathname: `/${catalogWordForLocale("services", input.locale)}/${input.slug.toLowerCase()}`,
    host: { hostKind: input.hostKind, settings },
    index: input.index,
  });
  if (res.kind === "current" || res.kind === "rewrite") return res.offeringId;
  if (res.kind !== "redirect") return null;
  const last = res.to.split("/").filter(Boolean).pop() ?? "";
  for (const l of [input.locale, ...settings.publicLocales]) {
    const hit = input.index.findBySlug(l, last);
    if (hit) return hit.offeringId;
  }
  return null;
}
