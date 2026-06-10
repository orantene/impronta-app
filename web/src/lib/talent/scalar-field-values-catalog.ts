// ============================================================================
// scalar-field-values-catalog.ts — Tier A dual-write helper (P3, field-engine
// value unification). Modeled verbatim on roster-field-values-catalog.ts
// (Tier D, the proven template merged on main).
//
// The Tier-A fields are SCALARS that persist to dedicated columns on
// `talent_profiles`:
//   tagline              (text)    → registry key `identity.tagline`
//   bio_tone             (text)    → registry key `about.bioTone`
//   response_time        (text)    → registry key `identity.response_time`
//   rate_card_visibility (text)    → registry key `commercial.rateCardVisibility`
//   ask_for_quote        (boolean) → registry key `commercial.askForQuote`
//   travel_included      (boolean) → registry key `commercial.travelIncluded`
//   lodging_included     (boolean) → registry key `commercial.lodgingIncluded`
//   age_display_mode     (text)    → registry key `identity.ageDisplayMode`     (registered by this tier)
//   passport_status      (text)    → registry key `logistics.passportStatus`    (registered by this tier)
//   drivers_license      (text)    → registry key `logistics.driversLicense`    (registered by this tier)
//
// P3 converges field VALUES onto the catalog value table
// `talent_profile_field_values`. This helper is the Stage-1 DUAL-WRITE: every
// caller that writes one of these columns ALSO upserts the value into the
// catalog table here, alongside (not instead of) the column write. The column
// write stays the source of truth until the read-flip (Stage 4) + the column
// drop (Stage 5, a later release).
//
// Fire-and-forget — errors are logged + swallowed so a failed catalog mirror
// never blocks the column write the caller already trusts.
//
// ─── CRITICAL difference from Tier D ────────────────────────────────────────
// Tier-D fields live on the natively-tenant-scoped `agency_talent_roster`.
// Tier-A scalars live on `talent_profiles`, which is GLOBAL / un-tenanted (one
// value per talent, not per roster). The value table needs a `tenant_id`, so
// the caller supplies the tenant from the talent's ACTIVE roster. A no-roster
// (independent, self-registered) talent has NO tenant → we SKIP the value-row
// write entirely; the dedicated column stays the source and the read-flip
// falls back to it. (All current talents have an active roster, so this is a
// safety path, not a common one.)
//
// ─── EMPTINESS contract ─────────────────────────────────────────────────────
// Shared verbatim with the backfill migration + parity SQL so all three agree
// on which rows get a value row:
//   TEXT scalars    present ⇔ not null AND trim <> ''
//   BOOLEAN scalars present ⇔ not null/undefined   (a stored `false` is a REAL
//                                                    value — it is NOT empty)
// When a TEXT field is "empty" the helper DELETEs any stale value row so the
// two stores never diverge. A boolean is never "empty" once the caller edits
// it (false ≠ absent), so a boolean edit always upserts.
//
// The value-table unique key is (talent_profile_id, field_definition_id) — ONE
// row per talent per field — matching the upsert onConflict.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";

// Canonical registry keys for the ten Tier-A scalar fields.
export const SCALAR_FIELD_KEYS = {
  tagline: "identity.tagline",
  bio_tone: "about.bioTone",
  response_time: "identity.response_time",
  rate_card_visibility: "commercial.rateCardVisibility",
  ask_for_quote: "commercial.askForQuote",
  travel_included: "commercial.travelIncluded",
  lodging_included: "commercial.lodgingIncluded",
  age_display_mode: "identity.ageDisplayMode",
  passport_status: "logistics.passportStatus",
  drivers_license: "logistics.driversLicense",
} as const;

// The text vs boolean split decides the emptiness contract + jsonb shape.
const TEXT_KEYS = new Set([
  "tagline",
  "bio_tone",
  "response_time",
  "rate_card_visibility",
  "age_display_mode",
  "passport_status",
  "drivers_license",
]);
const BOOL_KEYS = new Set(["ask_for_quote", "travel_included", "lodging_included"]);

// The helper accepts the deeply-generic Supabase client OR the service-role
// client; both flow through the same query surface. `any` keeps the helper
// readable + isolated, mirroring roster-field-values-catalog.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient | any;

// Only keys PRESENT (not `undefined`) are touched — an absent key means the
// caller didn't edit it. Text fields accept string | null; booleans accept
// boolean. `undefined` is "untouched".
export type ScalarFieldValues = {
  tagline?: string | null;
  bio_tone?: string | null;
  response_time?: string | null;
  rate_card_visibility?: string | null;
  age_display_mode?: string | null;
  passport_status?: string | null;
  drivers_license?: string | null;
  ask_for_quote?: boolean | null;
  travel_included?: boolean | null;
  lodging_included?: boolean | null;
};

/** True when a text scalar carries a real value (not null, not blank). */
function textPresent(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Dual-write the supplied Tier-A scalars into `talent_profile_field_values`.
 * Only keys PRESENT in `fields` are touched. A present TEXT key whose value is
 * empty DELETEs any stale value row; a TEXT key with a value, or any BOOLEAN
 * key (false included), upserts the value row.
 *
 * When `tenantId` is null (no active roster) the write is SKIPPED entirely —
 * the column stays the source for independent talents.
 *
 * Fire-and-forget: every failure is logged + swallowed. Never throws; never
 * blocks the column write the caller already performed.
 */
export async function syncScalarFieldValuesToCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
  tenantId: string | null,
  fields: ScalarFieldValues,
): Promise<void> {
  try {
    // No tenant (independent talent) → the value table needs a tenant; skip.
    if (!tenantId) return;

    // Which canonical keys did the caller actually edit, and are they present?
    const edits: Array<{ key: string; present: boolean; value: unknown }> = [];
    for (const [col, fieldKey] of Object.entries(SCALAR_FIELD_KEYS)) {
      const raw = (fields as Record<string, unknown>)[col];
      if (raw === undefined) continue; // untouched

      if (TEXT_KEYS.has(col)) {
        const v = raw as string | null;
        const present = textPresent(v);
        edits.push({ key: fieldKey, present, value: present ? v!.trim() : null });
      } else if (BOOL_KEYS.has(col)) {
        // Booleans: a stored `false` is a REAL value → present ⇔ not null.
        const present = raw !== null;
        edits.push({ key: fieldKey, present, value: present ? Boolean(raw) : null });
      }
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
      void improntaLog("scalar_field_values.def_lookup_failed", {
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
          void improntaLog("scalar_field_values.delete_failed", {
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
        void improntaLog("scalar_field_values.upsert_failed", {
          talentProfileId,
          field_key: edit.key,
          error_message: upErr.message ?? String(upErr),
        });
      }
    }
  } catch (err) {
    void improntaLog("scalar_field_values.unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// readScalarFieldValuesFromCatalog — Stage-4 read source.
//
// After parity is proven, the loaders source these scalars from the catalog
// value row FIRST, falling back to the dedicated column when no value row
// exists. The dual-write keeps the value table fresh; this read makes the
// catalog the live source while the column remains a safety net (kept until
// Stage 5).
//
// Booleans come back as `boolean | undefined` — `undefined` means "no value
// row" so the loader falls back to the column. (A real `false` value row IS
// returned as `false`, so `?? column` would NOT clobber it — the loaders use
// the `??`-on-the-read-result pattern so a present `false` wins.)
// ---------------------------------------------------------------------------

export type ScalarFieldValueReads = {
  tagline?: string | null;
  bio_tone?: string | null;
  response_time?: string | null;
  rate_card_visibility?: string | null;
  age_display_mode?: string | null;
  passport_status?: string | null;
  drivers_license?: string | null;
  ask_for_quote?: boolean;
  travel_included?: boolean;
  lodging_included?: boolean;
};

// Reverse map: field_key → the ScalarFieldValueReads property name.
const KEY_TO_PROP: Record<string, keyof ScalarFieldValueReads> = Object.fromEntries(
  Object.entries(SCALAR_FIELD_KEYS).map(([col, key]) => [key, col as keyof ScalarFieldValueReads]),
) as Record<string, keyof ScalarFieldValueReads>;

/**
 * Fetch the catalog value rows for the ten Tier-A scalars for one talent.
 * Returns a partial object — only keys that HAVE a value row are populated, so
 * the loader can fall back to the dedicated column for absent keys via `??`.
 * Errors are logged + swallowed and return `{}` (full column fallback).
 */
export async function readScalarFieldValuesFromCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
): Promise<ScalarFieldValueReads> {
  try {
    const { data, error } = await supabase
      .from("talent_profile_field_values")
      .select("value, profile_field_definitions!inner(field_key)")
      .eq("talent_profile_id", talentProfileId)
      .in("profile_field_definitions.field_key", Object.values(SCALAR_FIELD_KEYS));
    if (error) {
      void improntaLog("scalar_field_values.read_failed", {
        talentProfileId,
        error_message: error.message ?? String(error),
      });
      return {};
    }
    const out: ScalarFieldValueReads = {};
    for (const row of (data ?? []) as Array<{
      value: unknown;
      profile_field_definitions: { field_key?: string } | { field_key?: string }[] | null;
    }>) {
      const defEmbed = Array.isArray(row.profile_field_definitions)
        ? row.profile_field_definitions[0]
        : row.profile_field_definitions;
      const key = defEmbed?.field_key;
      if (!key) continue;
      const prop = KEY_TO_PROP[key];
      if (!prop) continue;
      if (BOOL_KEYS.has(prop)) {
        // booleans → coerce; a real stored `false` stays `false`
        (out as Record<string, unknown>)[prop] = Boolean(row.value);
      } else {
        (out as Record<string, unknown>)[prop] = typeof row.value === "string" ? row.value : null;
      }
    }
    return out;
  } catch (err) {
    void improntaLog("scalar_field_values.read_unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
