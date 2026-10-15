/**
 * Pure dedupe for the guest dock catalog (TUL-1065). Two package/service rows are
 * identical when owner (talentProfileId or null), trimmed case-insensitive title and
 * amountCents all match; the first one wins. Other categories are never touched.
 */
export type DedupeRow = {
  category: string;
  title: string;
  amountCents: number | null;
  talentProfileId: string | null;
};

const DEDUPED_CATEGORIES: ReadonlySet<string> = new Set(["package", "service"]);

export function dedupeCatalogRows<T extends DedupeRow>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!DEDUPED_CATEGORIES.has(row.category)) {
      out.push(row);
      continue;
    }
    const key = [row.category, row.talentProfileId ?? "", row.title.trim().toLowerCase(), row.amountCents ?? ""].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
