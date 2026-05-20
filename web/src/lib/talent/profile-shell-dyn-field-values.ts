/**
 * Sync profile shell `dynFields` to public.field_values (catalog keys only).
 * Staff vs talent use different `editable_by_*` gates on field_definitions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { mirrorWriteToCanonical } from "@/lib/fields/legacy-mirror";
import { mirrorHeightCmToTalentProfile } from "@/lib/field-values-height-mirror";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type ShellDynFieldEditor = "staff" | "talent";

type Result = { ok: true } | { ok: false; error: string };

const SUPPORTED_DYN_FV_TYPES = ["text", "textarea", "number", "boolean", "date"] as const;
function isSupportedDynFvType(v: string): v is (typeof SUPPORTED_DYN_FV_TYPES)[number] {
  return (SUPPORTED_DYN_FV_TYPES as readonly string[]).includes(v);
}

function readSelectAllowedValuesDyn(config: unknown): Set<string> | null {
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

function parseBooleanRaw(raw: string): boolean | null {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return null;
}

type FieldDefDynRow = {
  id: string;
  key: string;
  value_type: string;
  editable_by_staff: boolean;
  editable_by_talent: boolean;
  active: boolean;
  archived_at: string | null;
  config: Record<string, unknown> | null;
  label_en: string | null;
};

function canEditDef(def: FieldDefDynRow, editor: ShellDynFieldEditor): boolean {
  return editor === "staff" ? def.editable_by_staff : def.editable_by_talent;
}

export async function syncProfileShellDynFieldValues(
  supabase: SupabaseClient,
  talent_profile_id: string,
  dyn_fields: Record<string, string | string[]> | undefined,
  editor: ShellDynFieldEditor,
): Promise<Result> {
  if (!dyn_fields || typeof dyn_fields !== "object") return { ok: true };

  const entries: { key: string; raw: string }[] = [];
  for (const [key, val] of Object.entries(dyn_fields)) {
    if (!key || key.startsWith("custom_")) continue;
    const raw = Array.isArray(val) ? val.map(String).join(", ") : String(val ?? "").trim();
    entries.push({ key, raw });
  }
  if (entries.length === 0) return { ok: true };

  const keys = [...new Set(entries.map((e) => e.key))];
  const { data: defs, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, key, value_type, editable_by_staff, editable_by_talent, active, archived_at, config, label_en")
    .in("key", keys);
  if (defErr) {
    logServerError("profile-shell-dyn-fv.defs", defErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const byKey = new Map(
    ((defs ?? []) as FieldDefDynRow[]).map((d) => [d.key, d] as const),
  );

  let touchedAiDoc = false;

  for (const { key, raw } of entries) {
    const def = byKey.get(key);
    if (!def) continue;
    if (def.archived_at || !def.active || !canEditDef(def, editor)) continue;
    if (!isSupportedDynFvType(def.value_type)) continue;
    if (isReservedTalentProfileFieldKey(def.key)) continue;

    const field_definition_id = def.id;
    let patch: Record<string, unknown> | null = null;

    if (def.value_type === "text" || def.value_type === "textarea") {
      const allowed = def.value_type === "text" ? readSelectAllowedValuesDyn(def.config) : null;
      if (allowed && raw.length > 0 && !allowed.has(raw)) {
        return { ok: false, error: `Invalid value for ${def.label_en ?? "field"}.` };
      }
      patch = raw.length > 0 ? { value_text: raw } : null;
    } else if (def.value_type === "number") {
      const n = raw ? Number(raw) : NaN;
      patch = Number.isFinite(n) ? { value_number: n } : null;
    } else if (def.value_type === "date") {
      patch = raw.length > 0 ? { value_date: raw } : null;
    } else if (def.value_type === "boolean") {
      if (raw.length === 0) {
        patch = null;
      } else {
        const b = parseBooleanRaw(raw);
        if (b === null) {
          return { ok: false, error: `Invalid value for ${def.label_en ?? "field"}.` };
        }
        patch = { value_boolean: b };
      }
    }

    if (!patch) {
      const { error } = await supabase
        .from("field_values")
        .delete()
        .eq("talent_profile_id", talent_profile_id)
        .eq("field_definition_id", field_definition_id);
      if (error) {
        logServerError("profile-shell-dyn-fv.delete", error);
        return { ok: false, error: CLIENT_ERROR.update };
      }
      touchedAiDoc = true;
      if (def.key === "height_cm") {
        const m = await mirrorHeightCmToTalentProfile(supabase, talent_profile_id, null);
        if (!m.ok) return { ok: false, error: CLIENT_ERROR.update };
      }
      // P5-γ legacy→canonical bridge — keep talent_profile_field_values in
      // sync for the 17 bridged keys. No-op for unbridged keys. Errors are
      // logged inside the helper and never block the legacy delete above.
      await mirrorWriteToCanonical(supabase, def.key, talent_profile_id, null);
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
      logServerError("profile-shell-dyn-fv.upsert", error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    touchedAiDoc = true;

    if (def.key === "height_cm") {
      const height =
        typeof patch.value_number === "number" && Number.isFinite(patch.value_number)
          ? Math.round(patch.value_number)
          : null;
      const m = await mirrorHeightCmToTalentProfile(supabase, talent_profile_id, height);
      if (!m.ok) return { ok: false, error: CLIENT_ERROR.update };
    }

    // P5-γ legacy→canonical bridge — extract the single scalar from the
    // typed-column patch and mirror to talent_profile_field_values for the
    // 17 bridged keys. No-op for unbridged keys; errors are logged inside
    // the helper and never block the legacy upsert above.
    const canonicalValue =
      patch.value_text ??
      patch.value_number ??
      patch.value_boolean ??
      patch.value_date ??
      null;
    await mirrorWriteToCanonical(supabase, def.key, talent_profile_id, canonicalValue);
  }

  if (touchedAiDoc) {
    await scheduleRebuildAiSearchDocument(supabase, talent_profile_id);
  }

  return { ok: true };
}
