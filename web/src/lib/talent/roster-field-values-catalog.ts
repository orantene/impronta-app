// ============================================================================
// roster-field-values-catalog.ts — Tier D dual-write helper (P3, field-engine
// value unification).
//
// The three roster-scoped profile fields persist to dedicated columns on
// `agency_talent_roster`:
//   internal_notes    (text)  → registry key `admin.internalNotes`
//   emergency_contact (jsonb) → registry key `emergency.contact`
//   field_locks_data  (jsonb) → registry key `admin.fieldLocks`
//
// P3 converges field VALUES onto the catalog value table
// `talent_profile_field_values`. This helper is the Stage-1 DUAL-WRITE: every
// caller that writes one of these columns ALSO upserts the value into the
// catalog table here, alongside (not instead of) the column write. The column
// write stays the source of truth until the read-flip (Stage 4) + the column
// drop (Stage 5, a later release).
//
// Modeled on `profile-shell-dyn-field-values.ts` / `legacy-mirror.ts`:
//   - Fire-and-forget semantically — errors are logged + swallowed so a failed
//     catalog mirror never blocks the column write the caller already trusts.
//   - `tenant_id` is supplied by the caller (roster rows are natively
//     tenant-scoped → these fields map cleanly to the tenant-scoped value
//     table). This is why Tier D is the first/lowest-risk family.
//   - The value-table unique key is (talent_profile_id, field_definition_id) —
//     ONE row per talent per field — so a multi-roster talent's value reflects
//     the most-recently-written tenant. Acceptable for this tier; the column
//     remains per-tenant authoritative.
//
// Emptiness contract (shared verbatim with the backfill migration + parity
// SQL so all three agree on which rows get a value row):
//   internal_notes   present  ⇔  not null AND trim <> ''
//   emergency_contact present ⇔  not null AND <> '{}'
//   field_locks_data  present ⇔  has ≥1 lock OR ≥1 reason key
// When a field is "empty" the helper DELETEs any stale value row so the two
// stores never diverge.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";

// Canonical registry keys for the three Tier-D fields.
export const ROSTER_FIELD_KEYS = {
  internal_notes: "admin.internalNotes",
  emergency_contact: "emergency.contact",
  field_locks_data: "admin.fieldLocks",
} as const;

// The helper accepts the deeply-generic Supabase client OR the service-role
// client; both flow through the same query surface. `any` keeps the helper
// readable + isolated, mirroring legacy-mirror.ts's `MirrorSupabase`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient | any;

type EmergencyContact = { name?: string; relation?: string; phone?: string } | Record<string, unknown>;
type FieldLocks = { locks?: unknown[]; reasons?: Record<string, unknown> } | Record<string, unknown>;

export type RosterFieldValues = {
  internal_notes?: string | null;
  emergency_contact?: EmergencyContact | null;
  field_locks_data?: FieldLocks | null;
};

/** True when `internal_notes` carries a real value. */
function notesPresent(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** True when `emergency_contact` carries a real value (not null, not `{}`). */
function emergencyPresent(v: EmergencyContact | null | undefined): boolean {
  if (v == null || typeof v !== "object") return false;
  return Object.keys(v as Record<string, unknown>).length > 0;
}

/** True when `field_locks_data` carries a real value (≥1 lock OR ≥1 reason). */
function fieldLocksPresent(v: FieldLocks | null | undefined): boolean {
  if (v == null || typeof v !== "object") return false;
  const obj = v as { locks?: unknown; reasons?: unknown };
  const hasLock = Array.isArray(obj.locks) && obj.locks.length > 0;
  const hasReason =
    obj.reasons != null &&
    typeof obj.reasons === "object" &&
    Object.keys(obj.reasons as Record<string, unknown>).length > 0;
  return hasLock || hasReason;
}

/**
 * Dual-write the supplied roster-scoped fields into
 * `talent_profile_field_values`. Only keys PRESENT in `fields` are touched
 * (an `undefined` key is left alone — the caller didn't edit it). A present
 * key whose value is "empty" (per the contract above) DELETEs the value row.
 *
 * Fire-and-forget: every failure is logged + swallowed. Never throws; never
 * blocks the column write the caller already performed.
 */
export async function syncRosterFieldValuesToCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
  tenantId: string | null,
  fields: RosterFieldValues,
): Promise<void> {
  try {
    // Which canonical keys did the caller actually edit?
    const edits: Array<{ key: string; present: boolean; value: unknown }> = [];
    if (fields.internal_notes !== undefined) {
      const present = notesPresent(fields.internal_notes);
      edits.push({
        key: ROSTER_FIELD_KEYS.internal_notes,
        present,
        value: present ? fields.internal_notes!.trim() : null,
      });
    }
    if (fields.emergency_contact !== undefined) {
      const present = emergencyPresent(fields.emergency_contact);
      edits.push({
        key: ROSTER_FIELD_KEYS.emergency_contact,
        present,
        value: present ? fields.emergency_contact : null,
      });
    }
    if (fields.field_locks_data !== undefined) {
      const present = fieldLocksPresent(fields.field_locks_data);
      edits.push({
        key: ROSTER_FIELD_KEYS.field_locks_data,
        present,
        value: present ? fields.field_locks_data : null,
      });
    }
    if (edits.length === 0) return;

    // Resolve field_definition_id per key in one lookup.
    const { data: defs, error: defErr } = await supabase
      .from("profile_field_definitions")
      .select("id, field_key")
      .in(
        "field_key",
        edits.map((e) => e.key),
      );
    if (defErr) {
      void improntaLog("roster_field_values.def_lookup_failed", {
        talentProfileId,
        error_message: defErr.message ?? String(defErr),
      });
      return;
    }
    const defIdByKey = new Map<string, string>();
    for (const row of (defs ?? []) as Array<{ id: string; field_key: string }>) {
      if (row?.id && row?.field_key) defIdByKey.set(row.field_key, row.id);
    }

    for (const edit of edits) {
      const fieldDefinitionId = defIdByKey.get(edit.key);
      if (!fieldDefinitionId) continue; // not registered — no-op

      if (!edit.present) {
        const { error: delErr } = await supabase
          .from("talent_profile_field_values")
          .delete()
          .eq("talent_profile_id", talentProfileId)
          .eq("field_definition_id", fieldDefinitionId);
        if (delErr) {
          void improntaLog("roster_field_values.delete_failed", {
            talentProfileId,
            field_key: edit.key,
            error_message: delErr.message ?? String(delErr),
          });
        }
        continue;
      }

      const { error: upErr } = await supabase.from("talent_profile_field_values").upsert(
        {
          tenant_id: tenantId,
          talent_profile_id: talentProfileId,
          field_definition_id: fieldDefinitionId,
          value: edit.value,
          workflow_state: "live",
          last_edited_role: "platform",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "talent_profile_id,field_definition_id" },
      );
      if (upErr) {
        void improntaLog("roster_field_values.upsert_failed", {
          talentProfileId,
          field_key: edit.key,
          error_message: upErr.message ?? String(upErr),
        });
      }
    }
  } catch (err) {
    void improntaLog("roster_field_values.unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// readRosterFieldValuesFromCatalog — Stage-4 read source.
//
// After parity is proven, the loaders source these three fields from the
// catalog value row FIRST, falling back to the dedicated column when no value
// row exists. The dual-write keeps the value table fresh; this read makes the
// catalog the live source while the column remains a safety net (kept until
// Stage 5).
// ---------------------------------------------------------------------------

export type RosterFieldValueReads = {
  internal_notes?: string | null;
  emergency_contact?: unknown;
  field_locks_data?: unknown;
};

/**
 * Fetch the catalog value rows for the three Tier-D fields for one talent.
 * Returns a partial object — only keys that HAVE a value row are populated, so
 * the loader can fall back to the dedicated column for absent keys via `??`.
 * Errors are logged + swallowed and return `{}` (full column fallback).
 */
export async function readRosterFieldValuesFromCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
): Promise<RosterFieldValueReads> {
  try {
    const { data, error } = await supabase
      .from("talent_profile_field_values")
      .select("value, profile_field_definitions!inner(field_key)")
      .eq("talent_profile_id", talentProfileId)
      .in("profile_field_definitions.field_key", [
        ROSTER_FIELD_KEYS.internal_notes,
        ROSTER_FIELD_KEYS.emergency_contact,
        ROSTER_FIELD_KEYS.field_locks_data,
      ]);
    if (error) {
      void improntaLog("roster_field_values.read_failed", {
        talentProfileId,
        error_message: error.message ?? String(error),
      });
      return {};
    }
    const out: RosterFieldValueReads = {};
    for (const row of (data ?? []) as Array<{
      value: unknown;
      profile_field_definitions: { field_key?: string } | { field_key?: string }[] | null;
    }>) {
      const defEmbed = Array.isArray(row.profile_field_definitions)
        ? row.profile_field_definitions[0]
        : row.profile_field_definitions;
      const key = defEmbed?.field_key;
      if (key === ROSTER_FIELD_KEYS.internal_notes) {
        out.internal_notes = typeof row.value === "string" ? row.value : null;
      } else if (key === ROSTER_FIELD_KEYS.emergency_contact) {
        out.emergency_contact = row.value;
      } else if (key === ROSTER_FIELD_KEYS.field_locks_data) {
        out.field_locks_data = row.value;
      }
    }
    return out;
  } catch (err) {
    void improntaLog("roster_field_values.read_unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
