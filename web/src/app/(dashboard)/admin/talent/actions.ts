"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  booleanFromEquals,
  membershipTierSchema,
  parseWithSchema,
  trimmedString,
  visibilitySchema,
  workflowStatusSchema,
} from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import {
  readCanonicalLocationSelection,
  resolveCanonicalLocationSelection,
  validateCanonicalLocationSelection,
} from "@/lib/canonical-location";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { readBooleanFromFormData } from "@/lib/field-form-boolean";
import { mirrorHeightCmToTalentProfile } from "@/lib/field-values-height-mirror";
import {
  assignTaxonomyTermToProfile,
  removeTaxonomyTermFromProfile,
} from "@/lib/talent-taxonomy-service";
import {
  appendTranslationAudit,
  type TranslationAuditInput,
} from "@/lib/translation/audit";
import {
  buildBioEnEditExtras,
  type TalentBioRow,
} from "@/lib/translation/talent-bio-translation-service";
import { assertLocaleConsistency } from "@/lib/translation-center/save/assert-locale-consistency";
import type { Locale } from "@/i18n/config";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";

export type TalentActionState = { error?: string; success?: boolean } | undefined;

export type AdminTalentFieldValuesState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const SUPPORTED_VALUE_TYPES = ["text", "textarea", "number", "boolean", "date"] as const;
function isSupportedValueType(v: string): v is (typeof SUPPORTED_VALUE_TYPES)[number] {
  return (SUPPORTED_VALUE_TYPES as readonly string[]).includes(v);
}

function readSelectAllowedValues(config: unknown): Set<string> | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const input = (config as Record<string, unknown>).input;
  if (input !== "select") return null;
  const options = (config as Record<string, unknown>).options;
  if (!Array.isArray(options)) return null;
  const values = new Set<string>();
  for (const o of options) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const v = String((o as Record<string, unknown>).value ?? "").trim();
    if (v) values.add(v);
  }
  return values.size ? values : null;
}

const talentProfileUpdateSchema = z.object({
  talent_id: z.string().min(1, "Missing talent ID."),
  display_name: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  short_bio: z.string(),
  phone: z.string(),
  gender: z.string(),
  date_of_birth: z.string(),
  workflow_status: z.string(),
  visibility: z.string(),
  decision_note: z.string(),
  is_featured: z.boolean(),
  featured_level: z.string(),
  featured_position: z.string(),
  membership_tier: membershipTierSchema,
  has_residence_fields: z.boolean(),
  has_origin_fields: z.boolean(),
});

const talentFieldValuesSchema = z.object({
  talent_profile_id: z.string().min(1, "Missing talent profile."),
  field_ids: z.string().min(1, "No fields to save."),
});

const taxonomyMutationSchema = z.object({
  talent_profile_id: z.string().min(1, "Missing IDs."),
  taxonomy_term_id: z.string().min(1, "Missing IDs."),
});

const talentIdSchema = z.object({
  talent_id: z.string().min(1, "Missing talent ID."),
});

const bulkTalentActionSchema = z.object({
  talentIds: z.array(z.string()),
  action: z.enum(["approve", "hide", "feature", "unfeature", "soft_delete"]),
});

export async function updateTalentProfile(
  _prev: TalentActionState,
  formData: FormData,
): Promise<TalentActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = parseWithSchema(talentProfileUpdateSchema, {
    talent_id: trimmedString(formData, "talent_id"),
    display_name: trimmedString(formData, "display_name"),
    first_name: trimmedString(formData, "first_name"),
    last_name: trimmedString(formData, "last_name"),
    short_bio: trimmedString(formData, "short_bio"),
    phone: trimmedString(formData, "phone"),
    gender: trimmedString(formData, "gender"),
    date_of_birth: trimmedString(formData, "date_of_birth"),
    workflow_status: trimmedString(formData, "workflow_status"),
    visibility: trimmedString(formData, "visibility"),
    decision_note: trimmedString(formData, "decision_note"),
    is_featured: booleanFromEquals(formData, "is_featured"),
    featured_level: trimmedString(formData, "featured_level"),
    featured_position: trimmedString(formData, "featured_position"),
    membership_tier: trimmedString(formData, "membership_tier"),
    has_residence_fields:
      formData.has("residence_country_iso2") || formData.has("residence_city_name_en"),
    has_origin_fields:
      formData.has("origin_country_iso2") || formData.has("origin_city_name_en"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const {
    talent_id: id,
    display_name,
    first_name,
    last_name,
    short_bio,
    phone,
    gender,
    date_of_birth,
    workflow_status,
    visibility,
    decision_note,
    is_featured,
    featured_level: featured_level_raw,
    featured_position: featured_position_raw,
    membership_tier,
    has_residence_fields: hasCanonicalLocationFields,
    has_origin_fields: hasOriginFields,
  } = parsed.data;

  const { data: before, error: beforeErr } = await supabase
    .from("talent_profiles")
    .select(
      "workflow_status, visibility, bio_en, bio_es, bio_es_draft, bio_es_status, bio_en_draft, bio_en_status, short_bio",
    )
    .eq("id", id)
    .maybeSingle();
  if (beforeErr || !before) return { error: "Talent profile not found." };

  if (workflow_status && !workflowStatusSchema.safeParse(workflow_status).success) {
    return { error: "Invalid workflow status." };
  }

  if (visibility && !visibilitySchema.safeParse(visibility).success) {
    return { error: "Invalid visibility." };
  }

  if (!membershipTierSchema.safeParse(membership_tier).success) {
    return { error: "Invalid membership tier." };
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (display_name) payload.display_name = display_name;
  if (first_name !== undefined) payload.first_name = first_name || null;
  if (last_name !== undefined) payload.last_name = last_name || null;
  let bioAudit: TranslationAuditInput | null = null;
  if (short_bio !== undefined) {
    const editedLocaleRaw = String(formData.get("edited_locale") ?? "en");
    const editedLocale: Locale = editedLocaleRaw === "es" ? "es" : "en";
    const gate = assertLocaleConsistency(short_bio, editedLocale);
    if (!gate.ok) {
      return { error: gate.message };
    }
    const nowIso = new Date().toISOString();
    const { payload: bioPatch, audit } = buildBioEnEditExtras({
      talentProfileId: id,
      prev: before as TalentBioRow,
      nextShortBio: short_bio || null,
      actorId: user.id,
      nowIso,
    });
    Object.assign(payload, bioPatch);
    bioAudit = audit;
  }
  if (formData.has("phone")) payload.phone = phone || null;
  if (formData.has("gender")) payload.gender = gender || null;
  if (formData.has("date_of_birth")) payload.date_of_birth = date_of_birth || null;
  if (workflow_status) payload.workflow_status = workflow_status;
  if (visibility) payload.visibility = visibility;
  payload.is_featured = is_featured;
  if (featured_level_raw)
    payload.featured_level = parseInt(featured_level_raw, 10);
  if (featured_position_raw)
    payload.featured_position = parseInt(featured_position_raw, 10);
  if (membership_tier) payload.membership_tier = membership_tier;

  if (hasCanonicalLocationFields) {
    const residence = readCanonicalLocationSelection(formData, "residence");

    const residenceError = validateCanonicalLocationSelection(residence, {
      required: true,
      label: "Residence",
    });
    if (residenceError) return { error: residenceError };

    try {
      const residenceResolved = await resolveCanonicalLocationSelection(supabase, residence);

      if (!residenceResolved) return { error: "Residence country and city are required." };

      payload.location_id = residenceResolved.cityId;
      payload.residence_country_id = residenceResolved.countryId;
      payload.residence_city_id = residenceResolved.cityId;
    } catch (error) {
      logServerError("admin/updateTalentProfile/resolveCanonicalLocation", error);
      return { error: "Selected location is not available." };
    }
  }

  if (hasOriginFields) {
    const origin = readCanonicalLocationSelection(formData, "origin");
    const originError = validateCanonicalLocationSelection(origin, {
      required: false,
      label: "Originally from",
    });
    if (originError) return { error: originError };
    if (origin.country && origin.city) {
      try {
        const originResolved = await resolveCanonicalLocationSelection(supabase, origin);
        if (!originResolved) return { error: "Origin could not be resolved." };
        payload.origin_country_id = originResolved.countryId;
        payload.origin_city_id = originResolved.cityId;
      } catch (error) {
        logServerError("admin/updateTalentProfile/resolveCanonicalOrigin", error);
        return { error: "Selected origin location is not available." };
      }
    } else if (!origin.country && !origin.city) {
      payload.origin_country_id = null;
      payload.origin_city_id = null;
    }
  }

  const { error } = await supabase
    .from("talent_profiles")
    .update(payload)
    .eq("id", id);

  if (error) {
    logServerError("admin/updateTalentProfile", error);
    return { error: CLIENT_ERROR.update };
  }

  if (bioAudit) {
    await appendTranslationAudit(supabase, bioAudit);
  }

  // Explicit acceptance history for talent/staff clarity.
  try {
    const note = decision_note.length > 0 ? decision_note : null;
    if (workflow_status && workflow_status !== before.workflow_status) {
      await supabase.from("talent_workflow_events").insert({
        talent_profile_id: id,
        actor_user_id: user.id,
        event_type: "workflow_status_changed",
        payload: { from: before.workflow_status, to: workflow_status, note },
      });
    }
    if (visibility && visibility !== before.visibility) {
      await supabase.from("talent_workflow_events").insert({
        talent_profile_id: id,
        actor_user_id: user.id,
        event_type: "visibility_changed",
        payload: { from: before.visibility, to: visibility, note },
      });
    }
  } catch (e) {
    logServerError("admin/updateTalentProfile/workflowEvents", e);
  }

  await scheduleRebuildAiSearchDocument(supabase, id);

  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${id}`);
  return { success: true };
}

const talentWorkflowVisibilityInlineSchema = z.object({
  talent_id: z.string().min(1, "Missing talent ID."),
  workflow_status: workflowStatusSchema,
  visibility: visibilitySchema,
});

export type WorkflowVisibilityInlineResult = { error?: string; success?: true };

/** Updates workflow + visibility only (e.g. sidebar quick controls). Audited like full workflow save. */
export async function updateTalentWorkflowVisibilityInline(input: {
  talent_id: string;
  workflow_status: string;
  visibility: string;
}): Promise<WorkflowVisibilityInlineResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = talentWorkflowVisibilityInlineSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data." };
  }
  const { talent_id: id, workflow_status, visibility } = parsed.data;
  const { supabase, user } = auth;

  const { data: before, error: beforeErr } = await supabase
    .from("talent_profiles")
    .select("workflow_status, visibility")
    .eq("id", id)
    .maybeSingle();
  if (beforeErr || !before) return { error: "Talent profile not found." };

  if (before.workflow_status === workflow_status && before.visibility === visibility) {
    return { success: true };
  }

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      workflow_status,
      visibility,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logServerError("admin/updateTalentWorkflowVisibilityInline", error);
    return { error: CLIENT_ERROR.update };
  }

  try {
    if (workflow_status !== before.workflow_status) {
      await supabase.from("talent_workflow_events").insert({
        talent_profile_id: id,
        actor_user_id: user.id,
        event_type: "workflow_status_changed",
        payload: { from: before.workflow_status, to: workflow_status, note: null },
      });
    }
    if (visibility !== before.visibility) {
      await supabase.from("talent_workflow_events").insert({
        talent_profile_id: id,
        actor_user_id: user.id,
        event_type: "visibility_changed",
        payload: { from: before.visibility, to: visibility, note: null },
      });
    }
  } catch (e) {
    logServerError("admin/updateTalentWorkflowVisibilityInline/workflowEvents", e);
  }

  await scheduleRebuildAiSearchDocument(supabase, id);

  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${id}`);
  return { success: true };
}

export async function saveAdminTalentScalarFieldValues(
  _prev: AdminTalentFieldValuesState,
  formData: FormData,
): Promise<AdminTalentFieldValuesState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(talentFieldValuesSchema, {
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
    field_ids: trimmedString(formData, "field_ids"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { talent_profile_id, field_ids: fieldIdsRaw } = parsed.data;
  const fieldIds = fieldIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fieldIds.length === 0) return { error: "No fields to save." };

  const { data: defs, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, key, value_type, editable_by_staff, active, archived_at, config, label_en")
    .in("id", fieldIds);
  if (defErr) {
    logServerError("admin/saveFieldValues/defs", defErr);
    return { error: CLIENT_ERROR.update };
  }

  type DefRow = {
    id: string;
    key: string;
    value_type: string;
    editable_by_staff: boolean;
    active: boolean;
    archived_at: string | null;
    config: Record<string, unknown> | null;
    label_en: string | null;
  };
  const byId = new Map(((defs ?? []) as DefRow[]).map((d) => [d.id, d] as const));

  for (const field_definition_id of fieldIds) {
    const def = byId.get(field_definition_id);
    if (!def) continue;
    if (def.archived_at || !def.active || !def.editable_by_staff) continue;
    if (!isSupportedValueType(def.value_type)) continue;
    if (isReservedTalentProfileFieldKey(def.key)) continue;

    const name = `fv_${field_definition_id}`;
    const raw = formData.has(name) ? String(formData.get(name) ?? "").trim() : "";

    let patch: Record<string, unknown> | null = null;
    if (def.value_type === "text" || def.value_type === "textarea") {
      const allowed = def.value_type === "text" ? readSelectAllowedValues(def.config) : null;
      if (allowed && raw.length > 0 && !allowed.has(raw)) {
        return { error: `Invalid value for ${def.label_en ?? "field"}.` };
      }
      patch = raw.length > 0 ? { value_text: raw } : null;
    } else if (def.value_type === "number") {
      const n = raw ? Number(raw) : NaN;
      patch = Number.isFinite(n) ? { value_number: n } : null;
    } else if (def.value_type === "date") {
      patch = raw.length > 0 ? { value_date: raw } : null;
    } else if (def.value_type === "boolean") {
      const b = readBooleanFromFormData(formData, name);
      if (b === null) continue;
      patch = { value_boolean: b };
    }

    if (!patch) {
      const { error } = await supabase
        .from("field_values")
        .delete()
        .eq("talent_profile_id", talent_profile_id)
        .eq("field_definition_id", field_definition_id);
      if (error) {
        logServerError("admin/saveFieldValues/delete", error);
        return { error: CLIENT_ERROR.update };
      }
      if (def.key === "height_cm") {
        const m = await mirrorHeightCmToTalentProfile(supabase, talent_profile_id, null);
        if (!m.ok) return { error: CLIENT_ERROR.update };
      }
      continue;
    }

    const { error } = await supabase.from("field_values").upsert(
      {
        talent_profile_id,
        field_definition_id,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );
    if (error) {
      logServerError("admin/saveFieldValues/upsert", error);
      return { error: CLIENT_ERROR.update };
    }

    if (def.key === "height_cm") {
      const height =
        typeof patch.value_number === "number" && Number.isFinite(patch.value_number)
          ? Math.round(patch.value_number)
          : null;
      const m = await mirrorHeightCmToTalentProfile(supabase, talent_profile_id, height);
      if (!m.ok) return { error: CLIENT_ERROR.update };
    }
  }

  await scheduleRebuildAiSearchDocument(supabase, talent_profile_id);

  revalidatePath(`/admin/talent/${talent_profile_id}`);
  return { success: true, message: "Field values saved." };
}

export async function assignTaxonomyTerm(
  _prev: TalentActionState,
  formData: FormData,
): Promise<TalentActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(taxonomyMutationSchema, {
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
    taxonomy_term_id: trimmedString(formData, "taxonomy_term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { talent_profile_id, taxonomy_term_id } = parsed.data;

  const result = await assignTaxonomyTermToProfile(supabase, {
    talentProfileId: talent_profile_id,
    taxonomyTermId: taxonomy_term_id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/admin/talent/${talent_profile_id}`);
  return { success: true };
}

export async function removeTaxonomyTerm(
  _prev: TalentActionState,
  formData: FormData,
): Promise<TalentActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(taxonomyMutationSchema, {
    talent_profile_id: trimmedString(formData, "talent_profile_id"),
    taxonomy_term_id: trimmedString(formData, "taxonomy_term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { talent_profile_id, taxonomy_term_id } = parsed.data;

  const result = await removeTaxonomyTermFromProfile(supabase, {
    talentProfileId: talent_profile_id,
    taxonomyTermId: taxonomy_term_id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/admin/talent/${talent_profile_id}`);
  return { success: true };
}

export async function softDeleteTalentProfile(
  _prev: TalentActionState,
  formData: FormData,
): Promise<TalentActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(talentIdSchema, {
    talent_id: trimmedString(formData, "talent_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { talent_id: id } = parsed.data;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("talent_profiles")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    logServerError("admin/softDeleteTalentProfile", error);
    return { error: "Could not remove profile." };
  }

  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${id}`);
  return { success: true };
}

export type BulkTalentActionInput = {
  talentIds: string[];
  action:
    | "approve"
    | "hide"
    | "feature"
    | "unfeature"
    | "soft_delete";
};

export async function adminBulkTalentAction(
  input: BulkTalentActionInput,
): Promise<{ error?: string; ok?: boolean; updated?: number }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const parsed = parseWithSchema(bulkTalentActionSchema, input);
  if ("error" in parsed) return { error: parsed.error };

  const ids = [...new Set(parsed.data.talentIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { error: "No talent selected." };
  if (ids.length > 80) return { error: "Too many profiles selected (max 80)." };

  const now = new Date().toISOString();
  let patch: Record<string, unknown> | null = null;

  switch (parsed.data.action) {
    case "approve":
      patch = {
        workflow_status: "approved",
        visibility: "public",
        updated_at: now,
      };
      break;
    case "hide":
      patch = {
        workflow_status: "hidden",
        visibility: "hidden",
        updated_at: now,
      };
      break;
    case "feature":
      patch = { is_featured: true, updated_at: now };
      break;
    case "unfeature":
      patch = { is_featured: false, updated_at: now };
      break;
    case "soft_delete":
      patch = { deleted_at: now, updated_at: now };
      break;
    default:
      return { error: "Unknown action." };
  }

  const { data: beforeRows, error: loadErr } = await supabase
    .from("talent_profiles")
    .select("id, workflow_status, visibility, deleted_at")
    .in("id", ids);

  if (loadErr) {
    logServerError("admin/bulkTalent/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }

  const eligible = (beforeRows ?? []).filter(
    (r) => !(r as { deleted_at?: string | null }).deleted_at,
  ) as Array<{ id: string; workflow_status: string; visibility: string }>;

  const eligibleIds = eligible.map((r) => r.id);
  if (eligibleIds.length === 0) return { error: "No eligible profiles in selection." };

  let up = supabase.from("talent_profiles").update(patch).in("id", eligibleIds);
  if (parsed.data.action === "soft_delete") {
    up = up.is("deleted_at", null);
  }
  const { error: upErr } = await up;
  if (upErr) {
    logServerError("admin/bulkTalent/update", upErr);
    return { error: CLIENT_ERROR.update };
  }

  if (parsed.data.action === "approve" || parsed.data.action === "hide") {
    try {
      for (const b of eligible) {
        if (patch.workflow_status && patch.workflow_status !== b.workflow_status) {
          await supabase.from("talent_workflow_events").insert({
            talent_profile_id: b.id,
            actor_user_id: user.id,
            event_type: "workflow_status_changed",
            payload: {
              from: b.workflow_status,
              to: patch.workflow_status,
              note: "bulk action",
            },
          });
        }
        if (patch.visibility && patch.visibility !== b.visibility) {
          await supabase.from("talent_workflow_events").insert({
            talent_profile_id: b.id,
            actor_user_id: user.id,
            event_type: "visibility_changed",
            payload: {
              from: b.visibility,
              to: patch.visibility,
              note: "bulk action",
            },
          });
        }
      }
    } catch (e) {
      logServerError("admin/bulkTalent/events", e);
    }
  }

  revalidatePath("/admin/talent");
  for (const id of eligibleIds) revalidatePath(`/admin/talent/${id}`);
  for (const id of eligibleIds) {
    await scheduleRebuildAiSearchDocument(supabase, id);
  }
  return { ok: true, updated: eligibleIds.length };
}

export async function restoreTalentProfile(
  _prev: TalentActionState,
  formData: FormData,
): Promise<TalentActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(talentIdSchema, {
    talent_id: trimmedString(formData, "talent_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { talent_id: id } = parsed.data;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("talent_profiles")
    .update({ deleted_at: null, updated_at: now })
    .eq("id", id)
    .not("deleted_at", "is", null);

  if (error) {
    logServerError("admin/restoreTalentProfile", error);
    return { error: "Could not restore profile." };
  }

  await scheduleRebuildAiSearchDocument(supabase, id);

  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${id}`);
  return { success: true };
}
