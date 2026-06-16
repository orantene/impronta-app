/**
 * Sync profile shell `dynFields` to canonical System B
 * (`talent_profile_field_values`), catalog keys only.
 *
 * T3.2 — System A removed. This path used to read the legacy `field_definitions`
 * registry + write `field_values`; both are gone. It now reads the field
 * metadata + gate from canonical System B (`profile_field_definitions`), keyed by
 * each incoming legacy (A) key's bridged B `field_key`, and writes ONLY System B
 * via `mirrorWriteToCanonical`. The write path was already B-first by default;
 * T3.2 drops the `shell:a` System-A write kill switch entirely.
 *
 * Staff vs talent use different gates: `talent` → B `talent_editable`; `staff` →
 * any non-`admin_only` field (staff/admin may edit anything that isn't admin-only,
 * matching the legacy `editable_by_staff` semantics).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import {
  mirrorWriteToCanonical,
  prefetchMirrorCanonicalContext,
  OLD_TO_NEW_KEY,
  NEW_TO_OLD_KEY,
} from "@/lib/fields/legacy-mirror";
import { mirrorHeightCmToTalentProfile } from "@/lib/field-values-height-mirror";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type ShellDynFieldEditor = "staff" | "talent";

type Result = { ok: true } | { ok: false; error: string };

const SUPPORTED_DYN_FV_TYPES = ["text", "textarea", "number", "boolean", "date"] as const;
function isSupportedDynFvType(v: string): v is (typeof SUPPORTED_DYN_FV_TYPES)[number] {
  return (SUPPORTED_DYN_FV_TYPES as readonly string[]).includes(v);
}

function parseBooleanRaw(raw: string): boolean | null {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return null;
}

/** A bridged shell field resolved from canonical System B, keyed back to its
 *  legacy (A) key (which `mirrorWriteToCanonical` + the height mirror still use). */
type ShellDynFieldDef = {
  /** Legacy (A) key — the key the incoming dynFields are keyed by. */
  key: string;
  /** Coercion type, mapped from the B `kind`. */
  value_type: string;
  /** Talent self-edit gate (B `talent_editable`). */
  editable_by_talent: boolean;
  /** Staff/admin edit gate (B `!admin_only`). */
  editable_by_staff: boolean;
  /** Display label for error messages (B `label`). */
  label_en: string | null;
};

function canEditDef(def: ShellDynFieldDef, editor: ShellDynFieldEditor): boolean {
  return editor === "staff" ? def.editable_by_staff : def.editable_by_talent;
}

/** Map a System B `kind` to the shell's supported scalar `value_type`. Select-
 *  family kinds collapse to "text" (the shell writes the scalar option value; the
 *  canonical mirror translates slug→label against B's options). Unsupported kinds
 *  (multiselect/chips/etc.) return null so the shell skips them — the same
 *  effective set the legacy A `value_type` SUPPORTED gate allowed. */
function bKindToShellValueType(kind: string | null): string | null {
  switch (kind) {
    case "number":
      return "number";
    case "toggle":
      return "boolean";
    case "date":
      return "date";
    case "textarea":
      return "textarea";
    case "select":
    case "text":
      return "text";
    default:
      return null;
  }
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

  // Resolve the incoming legacy (A) keys to their bridged canonical (B)
  // `field_key`s. Only bridged keys have a System B definition + value home;
  // unbridged keys are a value-store no-op (their only effect was the dead legacy
  // `field_values` write, removed in T2.6 — verified zero live rows in prod). The
  // `height_cm` column mirror runs independently below regardless.
  const legacyKeys = [...new Set(entries.map((e) => e.key))];
  const bKeyByLegacy = new Map<string, string>();
  for (const lk of legacyKeys) {
    const bKey = OLD_TO_NEW_KEY[lk];
    if (bKey) bKeyByLegacy.set(lk, bKey);
  }

  // Read the field metadata + gate from canonical System B
  // (`profile_field_definitions`) for the bridged keys. NO `field_definitions`.
  const byKey = new Map<string, ShellDynFieldDef>();
  const bKeysNeeded = [...new Set(bKeyByLegacy.values())];
  if (bKeysNeeded.length > 0) {
    const { data: defs, error: defErr } = await supabase
      .from("profile_field_definitions")
      .select("field_key, kind, talent_editable, admin_only, deprecated_at, label_i18n")
      .in("field_key", bKeysNeeded)
      .is("deprecated_at", null);
    if (defErr) {
      logServerError("profile-shell-dyn-fv.defs", defErr);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    type BDefRow = {
      field_key: string;
      kind: string | null;
      talent_editable: boolean;
      admin_only: boolean;
      deprecated_at: string | null;
      label_i18n: Record<string, string | null> | null;
    };
    const bDefByKey = new Map(
      ((defs ?? []) as BDefRow[]).map((d) => [d.field_key, d] as const),
    );
    for (const [legacyKey, bKey] of bKeyByLegacy) {
      const bDef = bDefByKey.get(bKey);
      if (!bDef) continue; // no live B def — skip (gate fails closed)
      const value_type = bKindToShellValueType(bDef.kind);
      if (!value_type) continue; // unsupported kind — skip
      byKey.set(legacyKey, {
        key: legacyKey,
        value_type,
        editable_by_talent: bDef.talent_editable === true,
        editable_by_staff: bDef.admin_only !== true,
        label_en: bDef.label_i18n?.en ?? null,
      });
    }
  }

  // P5-γ + §11.2 batching — hoist the canonical-mirror lookups (def id per
  // bridged key + tenant id from active roster) once for the whole batch.
  // Per-call inside the loop becomes a Map lookup + the upsert/delete RPC.
  const mirrorContext = await prefetchMirrorCanonicalContext(
    supabase,
    talent_profile_id,
    entries.map((e) => e.key),
  );

  /** Mirror `height_cm` to the `talent_profiles.height_cm` column. Independent
   *  of the value store. */
  async function syncHeightColumn(
    defKey: string,
    numericValue: number | null,
  ): Promise<{ ok: true } | { ok: false }> {
    if (defKey !== "height_cm") return { ok: true };
    const height =
      numericValue != null && Number.isFinite(numericValue)
        ? Math.round(numericValue)
        : null;
    const m = await mirrorHeightCmToTalentProfile(supabase, talent_profile_id, height);
    return m.ok ? { ok: true } : { ok: false };
  }

  let touchedAiDoc = false;

  for (const { key, raw } of entries) {
    const def = byKey.get(key);
    if (!def) continue; // unbridged / no live B def / unsupported kind — value-store no-op
    if (!canEditDef(def, editor)) continue;
    if (!isSupportedDynFvType(def.value_type)) continue;
    if (isReservedTalentProfileFieldKey(def.key)) continue;

    // Coerce the raw shell input to the single scalar System B stores. `null` ⇒
    // clear/delete. Select self-healing is handled inside `mirrorWriteToCanonical`
    // (it translates the incoming slug into B's option label).
    let canonicalValue: string | number | boolean | null = null;
    if (def.value_type === "text" || def.value_type === "textarea") {
      canonicalValue = raw.length > 0 ? raw : null;
    } else if (def.value_type === "number") {
      const n = raw ? Number(raw) : NaN;
      canonicalValue = Number.isFinite(n) ? n : null;
    } else if (def.value_type === "date") {
      canonicalValue = raw.length > 0 ? raw : null;
    } else if (def.value_type === "boolean") {
      if (raw.length === 0) {
        canonicalValue = null;
      } else {
        const b = parseBooleanRaw(raw);
        if (b === null) {
          return { ok: false, error: `Invalid value for ${def.label_en ?? "field"}.` };
        }
        canonicalValue = b;
      }
    }

    // Write canonical System B ONLY (the sole value store; System A removed). The
    // helper does the slug→label translation + delete-on-null + workflow/role.
    await mirrorWriteToCanonical(
      supabase,
      def.key,
      talent_profile_id,
      canonicalValue,
      mirrorContext,
    );
    touchedAiDoc = true;

    // Height column mirror (independent of the value store).
    const h = await syncHeightColumn(
      def.key,
      typeof canonicalValue === "number" ? canonicalValue : null,
    );
    if (!h.ok) return { ok: false, error: CLIENT_ERROR.update };
  }

  if (touchedAiDoc) {
    await scheduleRebuildAiSearchDocument(supabase, talent_profile_id);
  }

  return { ok: true };
}

/**
 * Hydrate the profile-shell `dynFields` for a talent — the READ counterpart of
 * `syncProfileShellDynFieldValues`. Returns a map keyed by the legacy (A) shell
 * key (e.g. `body_type`) so the shell editor (A-keyed) renders the saved values.
 *
 * T3.2 — System A removed. This reads canonical System B
 * (`talent_profile_field_values` joined to `profile_field_definitions`), the SAME
 * store the shell now writes, and maps each canonical `field_key` back to its
 * legacy shell key via `NEW_TO_OLD_KEY`. Returns `{ ok:false }` on a hard DB
 * error so the caller surfaces a generic error (same contract as the prior
 * A-reading hydrate). Reserved keys are excluded (basic-info has its own path).
 */
export async function loadProfileShellDynFieldValues(
  supabase: SupabaseClient,
  talent_profile_id: string,
): Promise<{ ok: true; values: Record<string, string> } | { ok: false }> {
  const { data: rows, error } = await supabase
    .from("talent_profile_field_values")
    .select("value, profile_field_definitions(field_key)")
    .eq("talent_profile_id", talent_profile_id);
  if (error) {
    logServerError("profile-shell-dyn-fv.hydrate", error);
    return { ok: false };
  }

  type Row = {
    value: unknown;
    profile_field_definitions:
      | { field_key: string }
      | Array<{ field_key: string }>
      | null;
  };
  const values: Record<string, string> = {};
  for (const r of (rows ?? []) as Row[]) {
    const def = Array.isArray(r.profile_field_definitions)
      ? r.profile_field_definitions[0]
      : r.profile_field_definitions;
    const bKey = def?.field_key;
    if (!bKey) continue;
    // Map the canonical field_key back to the legacy shell key. Keys with no
    // legacy equivalent (B-only fields) are not part of the A-keyed shell.
    const legacyKey = NEW_TO_OLD_KEY[bKey];
    if (!legacyKey || isReservedTalentProfileFieldKey(legacyKey)) continue;

    // Project B's JSONB scalar to the string the shell editor expects.
    const raw = r.value;
    let s: string | null = null;
    if (typeof raw === "string") {
      if (raw.length > 0) s = raw;
    } else if (typeof raw === "number") {
      if (Number.isFinite(raw)) s = String(raw);
    } else if (typeof raw === "boolean") {
      s = raw ? "true" : "false";
    }
    if (s !== null) values[legacyKey] = s;
  }
  return { ok: true, values };
}
