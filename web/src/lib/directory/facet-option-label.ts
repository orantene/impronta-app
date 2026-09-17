/**
 * Locale-aware display label for a scalar directory facet option.
 *
 * Facet option ids are the value-store SLUGS ("available_now", "athletic").
 * Today the sidebar rendered `humanizeEnumLabel(slug)`, which is English by
 * construction ("Available Now") — so /es showed English chips although the
 * catalog carries Spanish option labels in `profile_field_definitions.
 * option_labels_i18n` ({ "<value>": { en, es, … } }).
 *
 * Two pure helpers, both client-safe (no IO):
 *   - `localizedFacetOptionLabel` — server side: resolve the locale's label for
 *     a slug from the catalog map, or null when the catalog has nothing better
 *     than the slug itself (the `en` entry IS the value, so English always
 *     falls through to the humanized slug — English rendering is unchanged).
 *   - `facetOptionDisplayLabel` — render side: an option whose label the server
 *     already resolved (label !== id) is shown verbatim (never re-title-cased:
 *     Spanish does not capitalise every word); a slug-only option is humanized.
 */
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { humanizeEnumLabel } from "@/lib/directory/humanize-enum-label";

/** Lower + collapse runs of `[-_/ whitespace]` to one space. Mirrors the
 *  facet value-store normalizer so "Dark brown" == "dark_brown" == "dark-brown". */
function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-_/\s]+/g, " ").trim();
}

export function localizedFacetOptionLabel(
  optionLabels: Record<string, LocalizedMap> | null | undefined,
  slug: string,
  locale: string,
): string | null {
  if (!optionLabels) return null;
  const want = normalize(slug);
  if (!want) return null;
  const loc = locale.trim().toLowerCase();
  if (!loc) return null;
  for (const [value, map] of Object.entries(optionLabels)) {
    if (normalize(value) !== want) continue;
    const label = map?.[loc];
    if (typeof label !== "string") return null;
    const t = label.trim();
    // The `en` entry is seeded from the value itself; a label that only echoes
    // the slug adds nothing over the humanized fallback.
    if (!t || normalize(t) === want) return null;
    return t;
  }
  return null;
}

export function facetOptionDisplayLabel(opt: { id: string; label?: string | null }): string {
  const label = (opt.label ?? "").trim();
  if (label && label !== opt.id) return label;
  return humanizeEnumLabel(opt.id);
}
