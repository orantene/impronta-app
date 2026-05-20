import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * SOLE legitimate denormalization path for `talent_profiles.height_cm`.
 *
 * Per Phase 5-ε (web/docs/phase-5-execution-runbook-validated-2026-05-19.md
 * §P5-ε), `talent_profiles.height_cm` is a denormalized convenience column.
 * The CANONICAL store for height is `talent_profile_field_values` keyed by
 * `profile_field_definitions.field_key = 'physical.height_cm'`. Any writer
 * that updates `talent_profiles.height_cm` MUST first seed canonical
 * `talent_profile_field_values` (workflow_state='live') so the two never
 * drift. There were historically three writers; the two that bypassed
 * canonical have been augmented to seed it before they call into this
 * mirror. The current legitimate canonical-seeding call-sites are:
 *
 *   - web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions.ts
 *       (admin roster edit form — updateRosterTalentProfile)
 *   - web/src/lib/server-actions/roster-import.ts
 *       (bulk import row processor — processRosterImportRow; this is the
 *       implementation behind /api/admin/roster-import/route.ts)
 *
 * Anything new that needs to touch `talent_profiles.height_cm` should
 * follow the same canonical-first-then-denorm sequence and call this
 * mirror at the end. Do not write `talent_profiles.height_cm` directly
 * without seeding canonical — Phase 5 backfills depend on canonical
 * being authoritative.
 */

/** Keep `talent_profiles.height_cm` aligned with governed `field_values` for the height_cm definition. */
export async function mirrorHeightCmToTalentProfile(
  supabase: SupabaseClient,
  talentProfileId: string,
  heightCm: number | null,
): Promise<{ ok: true } | { ok: false }> {
  const { error } = await supabase
    .from("talent_profiles")
    .update({ height_cm: heightCm, updated_at: new Date().toISOString() })
    .eq("id", talentProfileId);
  if (error) {
    logServerError("field-values/mirrorHeightCm", error);
    return { ok: false };
  }
  return { ok: true };
}
