import "server-only";

import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "../theme-catalog/builtins";
import {
  TALENT_THEME_SCHEMA_VERSION,
  type TalentThemeCatalogRow,
  type TalentThemeKind,
} from "../theme-catalog/types";

/**
 * The in-code built-in as a catalog row, for a (kind, slug) the table has NO
 * row for at all (before the first `syncBuiltinTalentThemes`, or a fresh
 * environment). This keeps the apply actions and the `talent-theme` preview
 * consistent with `loadTalentThemeCatalog`, which serves the same built-ins
 * when the table is empty: whatever the gallery lists, the preview can render
 * and the actions can apply.
 *
 * Version 1 matches the version the first sync writes for a fresh built-in
 * (`planBuiltinSync`), so a site pinned before the sync stays in step after
 * it. A row that exists but is archived or draft is NOT resurrected here; the
 * caller only falls back when the lookup found nothing.
 */
export function builtinCatalogRow<K extends TalentThemeKind>(
  kind: K,
  slug: string,
): Extract<TalentThemeCatalogRow, { kind: K }> | null {
  const entries = kind === "design" ? BUILTIN_DESIGNS : BUILTIN_LOOKS;
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) return null;
  const row = {
    id: `builtin:${kind}:${slug}`,
    kind: entry.kind,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    tags: [...entry.tags],
    payload: entry.buildPayload(),
    preview: entry.preview,
    required_talent_tier: entry.required_talent_tier,
    status: "published",
    source: "builtin",
    version: 1,
    schema_version: TALENT_THEME_SCHEMA_VERSION,
    sort_order: entry.sort_order,
    is_new_until: entry.is_new_until,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  };
  return row as Extract<TalentThemeCatalogRow, { kind: K }>;
}
