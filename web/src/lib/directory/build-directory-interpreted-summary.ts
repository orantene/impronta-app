import type { TaxonomyFilterOption } from "@/lib/directory/taxonomy-filters";

function humanizeLocationSlug(slug: string): string {
  const t = slug.trim();
  if (!t) return "";
  return t
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Human-readable structured interpretation for directory QA and user trust.
 * Returns null when there is nothing beyond plain text search (no tax, location, or height).
 */
export function buildDirectoryInterpretedSummaryLine(args: {
  taxonomyOptions: TaxonomyFilterOption[];
  selectedTaxonomyIds: string[];
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  /** e.g. "cm" */
  heightUnitLabel: string;
}): string | null {
  const parts: string[] = [];
  const nameById = new Map(args.taxonomyOptions.map((o) => [o.id, o.name]));

  for (const id of args.selectedTaxonomyIds) {
    const n = nameById.get(id)?.trim();
    if (n) parts.push(n);
  }

  if (args.heightMinCm != null && args.heightMaxCm != null) {
    parts.push(
      `${args.heightMinCm}\u2013${args.heightMaxCm} ${args.heightUnitLabel}`,
    );
  }

  const loc = args.locationSlug.trim();
  if (loc) {
    parts.push(humanizeLocationSlug(loc));
  }

  if (parts.length === 0) return null;
  return parts.join(" \u00B7 ");
}
