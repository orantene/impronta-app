import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Bump the single-row `builder_catalog_version` sync counter (the P5 sync key)
 * so any consumer that stamps the version can detect that the published catalog
 * changed. Shared by both write paths (template lifecycle + catalog overlay) so
 * the behaviour is identical everywhere.
 *
 * BEST-EFFORT: a counter failure never fails the calling mutation — the catalog
 * change itself already committed. (Single super-admin operator, so the
 * read-then-write is not a practical race; an atomic RPC is a future nicety.)
 */
export async function bumpCatalogVersion(sb: SupabaseClient): Promise<void> {
  try {
    const { data } = await sb
      .from("builder_catalog_version")
      .select("version")
      .eq("id", 1)
      .maybeSingle();
    const next = ((data?.version as number | undefined) ?? 0) + 1;
    await sb
      .from("builder_catalog_version")
      .update({ version: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
  } catch (err) {
    logServerError("bumpCatalogVersion", err);
  }
}
