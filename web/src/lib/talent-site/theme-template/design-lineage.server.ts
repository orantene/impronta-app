import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Lineage of an authored design. Code-keyed tables (demo registry, token
 * defaults, type system, gallery palettes, fonts, seeded labels) only know code
 * design slugs, so an authored design ("Save as new design") INHERITS its
 * source for all of them. `designLineage` returns that source slug, or null for
 * a code design (or an unknown slug).
 */
export function lineageFromRow(row: { source?: unknown; preview?: unknown } | null | undefined): string | null {
  if (!row || row.source !== "authored") return null;
  const ps = (row.preview as { paletteSource?: unknown } | null | undefined)?.paletteSource;
  return typeof ps === "string" && ps.trim() ? ps.trim() : null;
}

export async function designLineage(slug: string, admin?: SupabaseClient | null): Promise<string | null> {
  const client = admin ?? createServiceRoleClient();
  if (!client || !slug) return null;
  const { data } = await client
    .from("talent_theme_catalog")
    .select("source, preview")
    .eq("kind", "design")
    .eq("slug", slug)
    .maybeSingle();
  const source = lineageFromRow(data as { source?: unknown; preview?: unknown } | null);
  return source && source !== slug ? source : null;
}

/** The slug to use for every code-keyed lookup: the source for an authored design, else the slug itself. */
export async function resolveDesignSource(slug: string, admin?: SupabaseClient | null): Promise<string> {
  return (await designLineage(slug, admin)) ?? slug;
}
