import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { isTalentThemeRequiredTier } from "../theme-catalog/tier";
import type {
  TalentThemeCatalogRow,
  TalentThemeKind,
  ThemePreview,
} from "../theme-catalog/types";

/**
 * Load ONE published catalog row by (kind, slug) for the apply actions.
 * Service-role read (the actions already resolved the owner); returns null on
 * a miss, a non-published row, a malformed row or any error. The listing +
 * tier-filtered gallery loader (`load-catalog.server.ts`, cache tag
 * `talent-theme-catalog`) is Phase 0.B and should reuse `coerceCatalogRow`.
 */

export const CATALOG_ROW_COLUMNS =
  "id, kind, slug, title, summary, category, tags, payload, preview, required_talent_tier, status, source, version, schema_version, sort_order, is_new_until, created_by, updated_by, created_at, updated_at";

/** Narrow a raw DB row; null when the discriminating fields are unusable. */
export function coerceCatalogRow(raw: unknown): TalentThemeCatalogRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "design" && r.kind !== "look") return null;
  if (typeof r.slug !== "string" || typeof r.id !== "string") return null;
  if (!isTalentThemeRequiredTier(r.required_talent_tier)) return null;
  const payload = r.payload && typeof r.payload === "object" ? r.payload : {};
  const preview = (r.preview && typeof r.preview === "object" ? r.preview : {}) as ThemePreview;
  return {
    id: r.id,
    kind: r.kind,
    slug: r.slug,
    title: typeof r.title === "string" ? r.title : r.slug,
    summary: typeof r.summary === "string" ? r.summary : "",
    category: typeof r.category === "string" ? r.category : null,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    payload,
    preview,
    required_talent_tier: r.required_talent_tier,
    status: r.status === "published" || r.status === "archived" ? r.status : "draft",
    source: r.source === "authored" ? "authored" : "builtin",
    version: typeof r.version === "number" ? r.version : 1,
    schema_version: typeof r.schema_version === "number" ? r.schema_version : 1,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    is_new_until: typeof r.is_new_until === "string" ? r.is_new_until : null,
    created_by: typeof r.created_by === "string" ? r.created_by : null,
    updated_by: typeof r.updated_by === "string" ? r.updated_by : null,
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  } as TalentThemeCatalogRow;
}

export async function loadPublishedCatalogRow<K extends TalentThemeKind>(
  admin: SupabaseClient,
  kind: K,
  slug: string,
): Promise<Extract<TalentThemeCatalogRow, { kind: K }> | null> {
  const { data, error } = await admin
    .from("talent_theme_catalog")
    .select(CATALOG_ROW_COLUMNS)
    .eq("kind", kind)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.catalog.loadRow", error);
    return null;
  }
  const row = coerceCatalogRow(data);
  if (!row || row.kind !== kind || row.status !== "published") return null;
  return row as Extract<TalentThemeCatalogRow, { kind: K }>;
}
