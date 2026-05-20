"use server";

// ============================================================================
// talent-field-values-catalog.ts — Talent-self version of the NEW catalog
// (talent_profile_field_values + profile_field_definitions) write paths.
// Parallels admin-talent-field-values.ts but uses `requireTalent` +
// ownership check + the `talent_editable` gate on the field definition.
//
// Lives in its own file (not appended to talent-field-values.ts) because
// the older file is reserved for legacy `field_values` writes and the
// project's formatter strips trailing additions during reformat passes.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { mirrorWriteToLegacy } from "@/lib/fields/legacy-mirror";
import {
  resolveTalentFields,
  type ResolvedField,
  type ResolvedFieldGroup,
} from "@/lib/field-engine/resolve-talent-fields";

const setValueSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  field_definition_id: pgUuidSchema(),
  value: z.unknown().optional(),
});

const setVisibilitySchema = z.object({
  talent_profile_id: pgUuidSchema(),
  field_definition_id: pgUuidSchema(),
  visibility: z.array(z.enum(["public", "agency", "private"])).max(3),
});

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

export async function setTalentFieldValueAsTalent(
  input: z.input<typeof setValueSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const parsed = setValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", v.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent is not on any active roster." };

  const { data: def } = await supabase
    .from("profile_field_definitions")
    .select("id, kind, field_key, talent_editable, deprecated_at")
    .eq("id", v.field_definition_id)
    .maybeSingle();
  if (!def) return { ok: false, error: "Unknown field." };
  if (def.deprecated_at) return { ok: false, error: "Field no longer accepts input." };
  if (def.talent_editable === false) {
    return { ok: false, error: "This field can only be edited by the workspace admin." };
  }

  if (isEmptyValue(v.value)) {
    const { error } = await supabase
      .from("talent_profile_field_values")
      .delete()
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("field_definition_id", v.field_definition_id);
    if (error) {
      logServerError("setTalentFieldValueAsTalent.delete", error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    // Mirror delete to legacy field_values for bridged keys so Discover /
    // the directory facet filters (which still read the OLD system) stay
    // in sync with talent self-edits — same bridge the admin path uses.
    await mirrorWriteToLegacy(supabase, def.kind as string,
      v.talent_profile_id, def.field_key as string | undefined, null);
    revalidatePath("/talent", "layout");
    return { ok: true };
  }

  const { error } = await supabase
    .from("talent_profile_field_values")
    .upsert(
      {
        tenant_id: rosterRow.tenant_id,
        talent_profile_id: v.talent_profile_id,
        field_definition_id: v.field_definition_id,
        value: v.value,
        workflow_state: "live",
        last_edited_role: "talent",
        last_edited_by_user_id: user.id,
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );

  if (error) {
    logServerError("setTalentFieldValueAsTalent.upsert", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Mirror write to legacy field_values for any bridged key. Discover and
  // a few legacy surfaces still read the OLD tables; without this, talent
  // self-edits through the new editor would not appear there until the
  // Phase 5 cutover — same bridge the admin write path already uses.
  await mirrorWriteToLegacy(supabase, def.kind as string,
    v.talent_profile_id, def.field_key as string | undefined, v.value);

  revalidatePath("/talent", "layout");
  return { ok: true };
}

export async function setTalentFieldVisibilityAsTalent(
  input: z.input<typeof setVisibilitySchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const parsed = setVisibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", v.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  const visibilityToStore = v.visibility.length === 0 ? null : v.visibility;
  const { error } = await supabase
    .from("talent_profile_field_values")
    .update({ visibility_override: visibilityToStore })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("field_definition_id", v.field_definition_id);

  if (error) {
    logServerError("setTalentFieldVisibilityAsTalent", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}

export async function getTalentFieldValuesAsTalent(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; values: Array<{ field_definition_id: string; value: unknown; visibility_override: string[] | null; workflow_state: string; updated_at: string | null }> }
  | { ok: false; error: string }
> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", input.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  const { data, error } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value, visibility_override, workflow_state, updated_at")
    .eq("talent_profile_id", input.talent_profile_id);
  if (error) {
    logServerError("getTalentFieldValuesAsTalent", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  return { ok: true, values: (data ?? []) as never };
}

/**
 * Resolve the field set for a talent editing their own profile. P5-δ
 * (2026-05-19) collapse: previously this surface ran a divergent
 * ~130-line resolver re-implementation that missed the Phase 4 columns
 * (`tenant_override`, `has_value`) and several admin-side niceties
 * (workspace overlays, weighted groups, brought-in-by attribution).
 * The talent now reads the SAME resolver as the admin — single source
 * of truth in `@/lib/field-engine/resolve-talent-fields`. Workspace
 * `enabled_override === false` rows still filter out (so a tenant that
 * disabled a field on the catalog won't surface it in the talent
 * editor), which is the right call: if the agency hid it, the talent
 * editing UI shouldn't pretend it's available.
 *
 * The talent's `tenantId` is resolved from their active roster — the
 * same pattern the writer (`setTalentFieldValueAsTalent`) uses. Auth +
 * ownership stay at the boundary; the resolver itself is auth-agnostic.
 */
export async function getFieldsForTalentAsTalent(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] }
  | { ok: false; error: string }
> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", input.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  // Resolve the talent's active-roster tenant — same lookup the writer
  // uses. A talent who isn't on any active roster has no tenant context
  // to resolve fields against; surface the same message the writer
  // returns so the editor can degrade consistently.
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on any active roster." };
  }

  return resolveTalentFields({
    supabase,
    talentProfileId: input.talent_profile_id,
    tenantId: rosterRow.tenant_id,
    viewerRole: "talent",
  });
}
