import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTenantTaxonomySeed,
  type SeedTermRow,
} from "@/lib/taxonomy/seed-tenant-taxonomy-core";

/**
 * Write a new tenant's taxonomy settings. The decision lives in
 * `seed-tenant-taxonomy-core.ts`; this is only the I/O around it.
 *
 * Called from the signup path with the vertical implied by the industry preset
 * — see the preset map agreed with Front Door. Only the three presets that
 * represent people derive a vertical; `agency` asks one follow-up question,
 * because an agency IS its vertical and a modelling agency and a security firm
 * both choose "agency". Everything else passes null.
 *
 * IDEMPOTENT. Safe to re-run on an existing tenant: it upserts on
 * (tenant_id, taxonomy_term_id). Re-running is also how a tenant switches
 * vertical.
 *
 * NOT A MIGRATION. Deliberately runtime code rather than SQL, because it runs
 * per tenant at creation time, and a migration would replay against tenants
 * that already exist and overwrite curation somebody did by hand. Impronta's
 * 572-of-901 curated set is exactly what must never be clobbered.
 */

/** Chunk size for the upsert. ~1,000 rows per tenant, so this is 2 round trips. */
const UPSERT_CHUNK = 500;

export type SeedTenantTaxonomyResult =
  | { ok: true; rowsWritten: number; enabled: number; verticalSlug: string | null }
  | { ok: false; error: string };

export async function seedTenantTaxonomy(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    /** A slug from TAXONOMY_VERTICAL_SLUGS, or null for "nothing fits". */
    verticalSlug: string | null;
    /** Stamped on the rows so an audit can tell seeding from hand-curation. */
    createdByUserId?: string | null;
  },
): Promise<SeedTenantTaxonomyResult> {
  const { data: terms, error: termsError } = await supabase
    .from("taxonomy_terms")
    .select("id, parent_id, level, slug")
    .eq("is_active", true);

  if (termsError || !terms) {
    return {
      ok: false,
      error: `could not read the taxonomy catalog: ${termsError?.message ?? "no rows"}`,
    };
  }

  let rows;
  try {
    rows = buildTenantTaxonomySeed({
      terms: terms as SeedTermRow[],
      verticalSlug: input.verticalSlug,
    });
  } catch (err) {
    // An unknown slug or catalog drift. Surface it rather than seeding a blank
    // picker that looks deliberate.
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // A partial write is worse than no write: absence means ENABLED, so the terms
  // that failed to land would silently stay on. Fail the whole call instead.
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({
      ...r,
      tenant_id: input.tenantId,
      created_by_user_id: input.createdByUserId ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("agency_taxonomy_settings")
      .upsert(chunk, { onConflict: "tenant_id,taxonomy_term_id" });
    if (error) {
      return {
        ok: false,
        error:
          `seeding failed after ${written} of ${rows.length} rows: ${error.message}. ` +
          `The tenant is in a PARTIAL state and unwritten terms are enabled by default; ` +
          `re-run this call, it is idempotent.`,
      };
    }
    written += chunk.length;
  }

  return {
    ok: true,
    rowsWritten: written,
    enabled: rows.filter((r) => r.is_enabled).length,
    verticalSlug: input.verticalSlug,
  };
}
