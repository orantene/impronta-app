"use server";

// ============================================================================
// admin-talent-identity.ts
// ============================================================================
//
// Phase 3 (master plan / deep QA fix) — agency-side persistence for the
// rich talent profile editor's IDENTITY tab.
//
// The prototype's IdentityEditor (`web/src/app/prototypes/admin-shell/
// _drawers.tsx:8619`) edits a `ProfileIdentity` shape. Until this action
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

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ─── Validation schema ────────────────────────────────────────────────────────
//
// Mirrors `ProfileIdentity` in _state.tsx:4961. We accept partial input —
// callers can save just one field at a time (the editor is autosave-style).
// Empty string → null is normalized in the action so the DB has clean
// "unset" semantics.

const fieldVisibilityValueSchema = z
  .array(z.enum(["public", "agency", "private"]))
  .min(1, "At least one channel required");

const fieldVisibilityObjectSchema = z
  .object({
    legalName: fieldVisibilityValueSchema.optional(),
    pronouns: fieldVisibilityValueSchema.optional(),
    gender: fieldVisibilityValueSchema.optional(),
    dob: fieldVisibilityValueSchema.optional(),
  })
  .strict();

const updateTalentIdentitySchema = z.object({
  talent_profile_id: z.string().uuid("Invalid talent profile id."),
  // All optional — the editor saves field-by-field.
  stage_name: z.string().optional(),
  legal_name: z.string().optional(),
  pronunciation: z.string().optional(),
  pronouns: z
    .enum(["she_her", "he_him", "they_them", "ze_zir", "custom"])
    .nullable()
    .optional(),
  pronouns_custom: z.string().optional(),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(), // YYYY-MM-DD or empty
  age_display_mode: z.enum(["exact", "range", "hidden"]).optional(),
  nationality: z.string().optional(),
  response_time: z.enum(["1h", "4h", "24h", "48h"]).nullable().optional(),
  field_visibility: fieldVisibilityObjectSchema.optional(),
});

export type UpdateTalentIdentityInput = z.infer<typeof updateTalentIdentitySchema>;

export type UpdateTalentIdentityResult =
  | { ok: true; talent_profile_id: string }
  | { ok: false; error: string };

/** Empty-to-null helper. Empty strings on optional text fields should clear
 *  the value, not store '' (postgres distinguishes '' from NULL). */
function nullifyEmpty(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined; // means "don't update this field"
  const t = v.trim();
  return t === "" ? null : t;
}

export async function updateTalentIdentity(
  input: UpdateTalentIdentityInput,
): Promise<UpdateTalentIdentityResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = updateTalentIdentitySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid identity payload." };
  }
  const v = parsed.data;

  // Authorization: ensure the talent_profile is on this tenant's roster.
  // Without this check, a staff member could PATCH any talent_profiles row
  // in the system (RLS would still block writes outside their tenant_id
  // for tenant-scoped tables, but talent_profiles is global — the agency
  // owns the row via agency_talent_roster). Belt-and-suspenders.
  const { data: roster, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
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

  // Build patch payload. Undefined keys are skipped, so a save can target
  // just one field without touching the others.
  const patch: Record<string, unknown> = {};
  if (v.stage_name !== undefined) patch.display_name = v.stage_name.trim();
  const legalName = nullifyEmpty(v.legal_name);
  if (legalName !== undefined) patch.legal_name = legalName;
  const pronunciation = nullifyEmpty(v.pronunciation);
  if (pronunciation !== undefined) patch.pronunciation = pronunciation;
  if (v.pronouns !== undefined) patch.pronouns = v.pronouns;
  const pronounsCustom = nullifyEmpty(v.pronouns_custom);
  if (pronounsCustom !== undefined) patch.pronouns_custom = pronounsCustom;
  const gender = nullifyEmpty(v.gender);
  if (gender !== undefined) patch.gender = gender;
  // date_of_birth: empty string → null; YYYY-MM-DD passes through.
  if (v.date_of_birth !== undefined) {
    const t = v.date_of_birth.trim();
    patch.date_of_birth = t === "" ? null : t;
  }
  if (v.age_display_mode !== undefined)
    patch.age_display_mode = v.age_display_mode;
  const nationality = nullifyEmpty(v.nationality);
  if (nationality !== undefined) patch.nationality = nationality;
  if (v.response_time !== undefined) patch.response_time = v.response_time;
  if (v.field_visibility !== undefined)
    patch.field_visibility = v.field_visibility;

  if (Object.keys(patch).length === 0) {
    return { ok: true, talent_profile_id: v.talent_profile_id };
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update(patch)
    .eq("id", v.talent_profile_id);

  if (error) {
    logServerError("admin-talent-identity.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Refresh server-rendered roster list + drawer surface.
  revalidatePath("/", "layout");

  return { ok: true, talent_profile_id: v.talent_profile_id };
}
