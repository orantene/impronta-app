import "server-only";

/**
 * Resolve Maison Design / Look catalog rows for apply.
 * DB published row first; else in-code Maison built-ins (not the 5×6 gallery list).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAISON_BUILTIN_DESIGN,
  MAISON_BUILTIN_LOOKS,
} from "@/lib/talent-site/theme-catalog/maison/builtins";
import {
  TALENT_THEME_SCHEMA_VERSION,
  type TalentThemeCatalogRow,
  type TalentThemeKind,
} from "@/lib/talent-site/theme-catalog/types";
import type { BuiltinDesignEntry, BuiltinLookEntry } from "@/lib/talent-site/theme-catalog/builtins/types";
import { coerceCatalogRow, CATALOG_ROW_COLUMNS } from "./theme-catalog-row";
import { logServerError } from "@/lib/server/safe-error";

function asPublishedRow(
  entry: BuiltinDesignEntry | BuiltinLookEntry,
): TalentThemeCatalogRow {
  return {
    id: `builtin:${entry.kind}:${entry.slug}`,
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
  } as TalentThemeCatalogRow;
}

function maisonBuiltinRow<K extends TalentThemeKind>(
  kind: K,
  slug: string,
): Extract<TalentThemeCatalogRow, { kind: K }> | null {
  if (kind === "design" && slug === MAISON_BUILTIN_DESIGN.slug) {
    return asPublishedRow(MAISON_BUILTIN_DESIGN) as Extract<TalentThemeCatalogRow, { kind: K }>;
  }
  if (kind === "look") {
    const look = MAISON_BUILTIN_LOOKS.find((l) => l.slug === slug);
    if (look) return asPublishedRow(look) as Extract<TalentThemeCatalogRow, { kind: K }>;
  }
  return null;
}

export async function loadMaisonCatalogRow<K extends Exclude<TalentThemeKind, "demo">>(
  admin: SupabaseClient,
  kind: K,
  slug: string,
): Promise<Extract<TalentThemeCatalogRow, { kind: K }> | null> {
  const { data, error } = await admin
    .from("talent_theme_catalog")
    .select(CATALOG_ROW_COLUMNS)
    .eq("kind", kind)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logServerError("maison.catalog.loadRow", error);
    return maisonBuiltinRow(kind, slug);
  }
  if (!data) return maisonBuiltinRow(kind, slug);
  const row = coerceCatalogRow(data);
  if (!row || row.kind !== kind || row.status !== "published") return null;
  return row as Extract<TalentThemeCatalogRow, { kind: K }>;
}
