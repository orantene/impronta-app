"use server";

import { revalidatePath } from "next/cache";
import { requireTalent } from "@/lib/server/action-guards";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { readBooleanFromFormData } from "@/lib/field-form-boolean";
import { mirrorHeightCmToTalentProfile } from "@/lib/field-values-height-mirror";
import { resolveSelectValue } from "@/lib/fields/coerce-select-value";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// A.4 INTENTIONAL DIVERGENCE: convert to `ServerActionResult<T>`. `useFormState` payload for
// the talent self-edit field-values forms; conversion requires re-binding the
// form action + narrowing in `basic-info-extra-scalar-fields.tsx`. Out of
// scope for the initial sweep.
export type TalentFieldValuesState = { error?: string; success?: boolean; message?: string } | undefined;

const SUPPORTED_VALUE_TYPES = ["text", "textarea", "number", "boolean", "date"] as const;

function isSupportedValueType(v: string): v is (typeof SUPPORTED_VALUE_TYPES)[number] {
  return (SUPPORTED_VALUE_TYPES as readonly string[]).includes(v);
}

export async function saveTalentScalarFieldValues(
  _prev: TalentFieldValuesState,
  formData: FormData,
): Promise<TalentFieldValuesState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const talent_profile_id = String(formData.get("talent_profile_id") ?? "").trim();
  if (!talent_profile_id) return { error: "Missing talent profile." };

  // Confirm ownership (explicit check in addition to RLS).
  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { error: "Not authorized." };

  const fieldIdsRaw = String(formData.get("field_ids") ?? "").trim();
  const fieldIds = fieldIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fieldIds.length === 0) return { error: "No fields to save." };

  const { data: defs, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, value_type, editable_by_talent, active, archived_at, label_en, config, key")
    .in("id", fieldIds);
  if (defErr) {
    logServerError("talent/saveFieldValues/defs", defErr);
    return { error: CLIENT_ERROR.update };
  }

  type DefRow = {
    id: string;
    key: string;
    value_type: string;
    editable_by_talent: boolean;
    active: boolean;
    archived_at: string | null;
    label_en: string;
    config: Record<string, unknown> | null;
  };

  const byId = new Map(((defs ?? []) as DefRow[]).map((d) => [d.id, d] as const));

  for (const field_definition_id of fieldIds) {
    const def = byId.get(field_definition_id);
    if (!def) continue;
    if (def.archived_at || !def.active || !def.editable_by_talent) continue;
    if (!isSupportedValueType(def.value_type)) continue;
    if (isReservedTalentProfileFieldKey(def.key)) continue;

    const name = `fv_${field_definition_id}`;
    const value_text = formData.has(name) ? String(formData.get(name) ?? "").trim() : "";

    let patch: Record<string, unknown> | null = null;

    if (def.value_type === "text" || def.value_type === "textarea") {
      let textToWrite = value_text;
      if (def.value_type === "text" && value_text.length > 0) {
        const res = resolveSelectValue(def.config, value_text);
        // Don't let an orphaned legacy value on an untouched select brick the
        // whole save — skip it. Self-heal label/case drift on a match.
        if (res.kind === "unmatchable") continue;
        if (res.kind === "matched") textToWrite = res.value;
      }
      patch = textToWrite.length > 0 ? { value_text: textToWrite } : null;
    } else if (def.value_type === "number") {
      const raw = value_text;
      const n = raw ? Number(raw) : NaN;
      patch = Number.isFinite(n) ? { value_number: n } : null;
    } else if (def.value_type === "date") {
      patch = value_text.length > 0 ? { value_date: value_text } : null;
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
        logServerError("talent/saveFieldValues/delete", error);
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
      logServerError("talent/saveFieldValues/upsert", error);
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

  revalidatePath("/talent", "layout");
  return { success: true, message: "Fields saved." };
}

