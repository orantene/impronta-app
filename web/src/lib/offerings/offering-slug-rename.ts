/**
 * offering-slug-rename.ts · what a rename does to a service's per-locale slugs (TUL-1324,
 * moved here from the old `slug_history` column; slugs live in `offering_slugs`). Pure.
 *
 * A slug that FOLLOWED the old title (the title's own slug, or `-2`, `-3`... of it) follows the
 * new title; the old slug stays as a history row, so the old link 301s to the new one. A slug
 * the owner typed (anything else) is never touched by a rename. Nothing is ever stolen from
 * another service: `takenByLocale` is every slug in the owner's scope and locale, current or
 * history, and a slug this service already used in the past is re-promoted instead of
 * duplicated (the unique index is (scope, locale, slug)).
 */
import { isReservedOfferingSlug, normalizeOfferingSlug, uniqueOfferingSlug } from "./offering-paths";

export type SlugRow = { id: string; locale: string; slug: string; isCurrent: boolean };

export type SlugOp =
  | { kind: "retire"; rowId: string }
  | { kind: "promote"; rowId: string }
  | { kind: "insert"; locale: string; slug: string };

const MAX_LOCALES = 20;

function followsTitle(slug: string, titleSlug: string): boolean {
  return titleSlug !== "" && (slug === titleSlug || new RegExp(`^${titleSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d{1,3}$`).test(slug));
}

export function planOfferingSlugRename(input: {
  oldTitle: string;
  newTitle: string;
  rows: readonly SlugRow[];
  takenByLocale: ReadonlyMap<string, ReadonlySet<string>>;
}): SlugOp[] {
  const oldBase = normalizeOfferingSlug(input.oldTitle);
  const newBase = normalizeOfferingSlug(input.newTitle);
  if (!newBase || isReservedOfferingSlug(newBase)) return [];
  const ops: SlugOp[] = [];
  let locales = 0;
  for (const current of input.rows.filter((r) => r.isCurrent)) {
    if (locales >= MAX_LOCALES) break;
    if (!followsTitle(current.slug, oldBase)) continue;
    // Already the new title's own slug (or a numbered one): nothing to do.
    if (followsTitle(current.slug, newBase)) continue;
    locales += 1;
    const mine = input.rows.find((r) => !r.isCurrent && r.locale === current.locale && r.slug === newBase);
    if (mine) {
      ops.push({ kind: "retire", rowId: current.id }, { kind: "promote", rowId: mine.id });
      continue;
    }
    const taken = input.takenByLocale.get(current.locale) ?? new Set<string>();
    const next = uniqueOfferingSlug(newBase, taken);
    ops.push({ kind: "retire", rowId: current.id }, { kind: "insert", locale: current.locale, slug: next });
  }
  return ops;
}
