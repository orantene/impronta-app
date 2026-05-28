"use server";

// ============================================================================
// admin-talent-identity.ts
// ============================================================================
//
// Phase 3 (master plan / deep QA fix) — agency-side persistence for the
// rich talent profile editor's IDENTITY tab.
//
// The admin shell's IdentityEditor
// (`web/src/components/admin/shell/internal/drawers.tsx`) edits a
// `ProfileIdentity` shape. Until this action
// the "Publish" / "Save" button just toasted via useSaveAndClose; nothing
// reached the database. Filling out a talent's legal name or pronouns and
// saving was a UI-only illusion.
//
// Schema gap closed by migration 20260907130000_talent_identity_fields.sql
// (adds: legal_name, pronunciation, pronouns, pronouns_custom,
//  age_display_mode, response_time, field_visibility).
//
// This action validates the shape with zod, requires staff tenant scope
// (so admins from another agency can't modify this tenant's talent), and
// updates the row in talent_profiles. Returns the updated identity for
// optimistic UI hydration on the client side.

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  buildTalentIdentityProfilePatch,
  type UpdateTalentIdentityInput,
} from "@/lib/talent/talent-profile-shell-persistence";

// Types for this action live in `talent-profile-shell-persistence.ts`.
// Do not re-export types from this `use server` file — Next's action
// bundler can incorrectly retain a runtime reference to the name.

export type UpdateTalentIdentityResult =
  | { ok: true; talent_profile_id: string }
  | { ok: false; error: string };

export async function updateTalentIdentity(
  input: UpdateTalentIdentityInput,
): Promise<UpdateTalentIdentityResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const built = buildTalentIdentityProfilePatch(input);
  if (!built.ok) return { ok: false, error: built.error };
  const vId = built.talent_profile_id;

  const { data: roster, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("id, status, exclusivity_status")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", vId)
    .neq("status", "removed")
    .maybeSingle();
  if (rosterErr) {
    logServerError("admin-talent-identity.roster-check", rosterErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!roster) {
    return {
      ok: false,
      error: "That talent isn't on your roster.",
    };
  }

  // Phase 2b — multi-tenant identity safety floor. Mirrors the guard in
  // commitTalentProfileShellAdmin and setTalentLanguages. Identity is the
  // talent's personal profile by definition, so any non-confirmed
  // relationship locks the agency out of overwriting it.
  // talent_profiles is a GLOBAL table (no tenant_id — talents exist
  // cross-tenant), so this read cannot route through tenantScopedQuery; the
  // raw .from() is grandfathered in eslint-suppressions.json.
  const { data: talentRow, error: tErr } = await supabase
    .from("talent_profiles")
    .select("user_id")
    .eq("id", vId)
    .maybeSingle();
  if (tErr) {
    logServerError("admin-talent-identity.talent-check", tErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const tulalaNativeIdentity = !!(
    talentRow as { user_id?: string | null } | null
  )?.user_id;
  const rosterExclusivity =
    (roster as { exclusivity_status?: string | null }).exclusivity_status ??
    null;
  if (tulalaNativeIdentity && rosterExclusivity !== "confirmed") {
    return {
      ok: false,
      error:
        "This talent owns their personal profile. Your agency can manage roster relationship only — not the talent's identity. Ask the talent to confirm exclusivity first.",
    };
  }

  if (Object.keys(built.patch).length === 0) {
    return { ok: true, talent_profile_id: vId };
  }

  const patch = { ...built.patch, updated_at: new Date().toISOString() };

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", vId);

  if (error) {
    logServerError("admin-talent-identity.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");

  return { ok: true, talent_profile_id: vId };
}
