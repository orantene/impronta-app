import { byName } from "@/lib/field-engine/sort-comparators";
import type { TalentProfile } from "../state";

export type RosterSortKey =
  | "recommended"
  | "name"
  | "completeness"
  | "newest"
  | "lastEdited";

const ts = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Comparator for the admin roster grid's Sort control.
 *
 * "recommended" mirrors the PUBLIC directory's default order (and the
 * Arrange-mode list): curated `directoryRank` first (nulls last), then
 * last-edited recency. With `dir="asc"` position 1 sorts first, so the
 * admin sees exactly what visitors see.
 */
export function rosterSortComparator(
  sort: RosterSortKey,
  dir: "asc" | "desc",
): (a: TalentProfile, b: TalentProfile) => number {
  return (a, b) => {
    let r = 0;
    if (sort === "name") r = byName(a, b);
    else if (sort === "recommended") {
      const ar = a.directoryRank ?? Number.POSITIVE_INFINITY;
      const br = b.directoryRank ?? Number.POSITIVE_INFINITY;
      r = ar !== br ? (ar < br ? -1 : 1) : ts(b.updatedAt) - ts(a.updatedAt);
    } else if (sort === "completeness") r = (a.completeness ?? 0) - (b.completeness ?? 0);
    else if (sort === "newest") r = ts(a.createdAt) - ts(b.createdAt);
    else if (sort === "lastEdited") r = ts(a.updatedAt) - ts(b.updatedAt);
    return dir === "asc" ? r : -r;
  };
}
