// ============================================================================
// identity-field-values-catalog.ts — Tier C dual-write helper (P3, field-engine
// value unification). Modeled verbatim on scalar-field-values-catalog.ts
// (Tier A) and blob-field-values-catalog.ts (Tier B), the proven templates
// merged on main.
//
// Tier C is identity PII on `talent_profiles`. Of the candidate columns
// (pronouns, pronouns_custom, gender, date_of_birth) this helper handles three:
//   pronouns         (text)   → registry key `identity.pronouns`        (pre-existing def)
//   pronouns_custom  (text)   → registry key `identity.pronounsCustom`  (registered by Tier C)
//   gender           (select) → registry key `identity.gender`          (Tier C tail; see below)
//
// ─── GENDER — Tier C tail (2026-06-10) ──────────────────────────────────────
// Gender was DEFERRED out of the first Tier-C wave: the `identity.gender` def
// was kind='select' with options=NULL and the column vocab was inconsistent
// (woman/female/male/man coexisted). The Tier-C tail closes that gap:
//   1. The `identity.gender` def now carries a clean, inclusive 14-option set
//      (Woman, Man, Non-binary, Trans woman, … Prefer not to say) — the
//      canonical DISPLAY values, which are ALSO the stored column values.
//   2. The column was normalized to those canonical values in lockstep
//      (female/woman → Woman, male/man → Man) by the gender-normalize migration.
//   3. The directory gender FACET — a SEPARATE System-B `field_definitions`
//      row keyed `gender` whose `config.filter_options` exact-matches the
//      column via `.in("gender", values)` — had its filter_options re-set to the
//      same canonical vocab in the same migration, so the directory filter keeps
//      matching after normalization. (The Tier-C note "not column-queried" was
//      WRONG: apply-directory-field-facet-filters.ts filters the column directly.
//      Normalization is only safe BECAUSE the facet config moved with it.)
// Gender is a TEXT-shaped value here (a single select string), so it flows
// through the same present-⇔-not-null-and-trim<>'' contract as the two pronouns
// text fields and is stored as a jsonb string.
//
// ─── DELIBERATELY EXCLUDED (investigation findings) ─────────────────────────
//  • date_of_birth → identity.dob — EXCLUDED. The legacy mirror
//    (legacy-mirror.ts, NEW_TO_OLD_KEY["identity.dob"]="date_of_birth") ALREADY
//    writes `identity.dob` value rows into talent_profile_field_values, sourced
//    from the OLD System-A `field_values.value_date` — NOT from the
//    talent_profiles.date_of_birth column. Live probe: the catalog value matches
//    the legacy value_date in 100% of rows but DISAGREES with the column in
//    every (19/19) case where both exist. A P3 dual-write/backfill from the
//    column would COLLIDE with + corrupt the legacy-bridged source that Discover
//    reads. DOB is ALSO query-critical: fetch-directory-page.ts filters the
//    directory age facet directly on talent_profiles.date_of_birth. DOB stays
//    DEDICATED. The legacy mirror keeps owning identity.dob value rows.
//
// P3 converges field VALUES onto the catalog value table
// `talent_profile_field_values`. This helper is the Stage-1 DUAL-WRITE: every
// caller that writes pronouns/pronouns_custom/gender on talent_profiles ALSO
// upserts the value into the catalog table here, alongside (not instead of) the
// column write. The column write stays the source of truth until the read-flip
// (Stage 4) + the column drop (Stage 5, a later release).
//
// Fire-and-forget — errors are logged + swallowed so a failed catalog mirror
// never blocks the column write the caller already trusts.
//
// ─── TENANT scoping (same as Tier A/B) ──────────────────────────────────────
// These columns live on `talent_profiles`, which is GLOBAL / un-tenanted (one
// value per talent). The value table needs a `tenant_id`, supplied by the
// caller from the talent's ACTIVE roster. A no-roster (independent,
// self-registered) talent has NO tenant → we SKIP the value-row write entirely;
// the dedicated column stays the source and the read-flip falls back to it.
// (Live probe: ALL 120 talents currently have an active roster, so this is a
// safety path, not a common one.)
//
// ─── EMPTINESS contract ─────────────────────────────────────────────────────
// Shared verbatim with the backfill migration + parity SQL so all three agree
// on which rows get a value row:
//   TEXT scalars  present ⇔ not null AND trim <> ''
// When a TEXT field is "empty" the helper DELETEs any stale value row so the two
// stores never diverge.
//
// The value-table unique key is (talent_profile_id, field_definition_id) — ONE
// row per talent per field — matching the upsert onConflict.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";

// Canonical registry keys for the Tier-C identity-PII fields. pronouns +
// pronouns_custom are free text; gender is a single select string that flows
// through the exact same text contract (present ⇔ not null AND trim<>'').
export const IDENTITY_FIELD_KEYS = {
  pronouns: "identity.pronouns",
  pronouns_custom: "identity.pronounsCustom",
  gender: "identity.gender",
} as const;

export type IdentityFieldColumn = keyof typeof IDENTITY_FIELD_KEYS;

// The helper accepts the deeply-generic Supabase client OR the service-role
// client; both flow through the same query surface. `any` keeps the helper
// readable + isolated, mirroring scalar-field-values-catalog.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient | any;

// Only keys PRESENT (not `undefined`) are touched — an absent key means the
// caller didn't edit it. All three fields are stored as text/string; accept
// string | null. `undefined` is "untouched".
export type IdentityFieldValues = {
  pronouns?: string | null;
  pronouns_custom?: string | null;
  gender?: string | null;
};

/** True when a text field carries a real value (not null, not blank). */
function textPresent(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Dual-write the supplied Tier-C identity fields (pronouns, pronouns_custom,
 * gender) into `talent_profile_field_values`. Only keys PRESENT in `fields` are
 * touched. A present key whose value is empty DELETEs any stale value row; a
 * present key with a value upserts the value row (stored as a jsonb string).
 *
 * When `tenantId` is null (no active roster) the write is SKIPPED entirely —
 * the column stays the source for independent talents.
 *
 * Fire-and-forget: every failure is logged + swallowed. Never throws; never
 * blocks the column write the caller already performed.
 */
export async function syncIdentityFieldValuesToCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
  tenantId: string | null,
  fields: IdentityFieldValues,
): Promise<void> {
  try {
    // No tenant (independent talent) → the value table needs a tenant; skip.
    if (!tenantId) return;

    // Which canonical keys did the caller actually edit, and are they present?
    const edits: Array<{ key: string; present: boolean; value: unknown }> = [];
    for (const [col, fieldKey] of Object.entries(IDENTITY_FIELD_KEYS) as Array<
      [IdentityFieldColumn, string]
    >) {
      const raw = (fields as Record<string, unknown>)[col];
      if (raw === undefined) continue; // untouched
      const v = raw as string | null;
      const present = textPresent(v);
      edits.push({ key: fieldKey, present, value: present ? v!.trim() : null });
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
      void improntaLog("identity_field_values.def_lookup_failed", {
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
          void improntaLog("identity_field_values.delete_failed", {
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
        void improntaLog("identity_field_values.upsert_failed", {
          talentProfileId,
          field_key: edit.key,
          error_message: upErr.message ?? String(upErr),
        });
      }
    }
  } catch (err) {
    void improntaLog("identity_field_values.unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// readIdentityFieldValuesFromCatalog — Stage-4 read source.
//
// After parity is proven, the loaders source these two fields from the catalog
// value row FIRST, falling back to the dedicated talent_profiles column when no
// value row exists. The dual-write keeps the value table fresh; this read makes
// the catalog the live source while the column remains a safety net (kept until
// Stage 5). Each value comes back as `string | null` or is absent (no value
// row) so the loader can fall back to the column via `??`.
// ---------------------------------------------------------------------------

export type IdentityFieldValueReads = {
  pronouns?: string | null;
  pronouns_custom?: string | null;
  gender?: string | null;
};

// Reverse map: field_key → the talent_profiles column name.
const KEY_TO_COLUMN: Record<string, IdentityFieldColumn> = Object.fromEntries(
  Object.entries(IDENTITY_FIELD_KEYS).map(([col, key]) => [key, col as IdentityFieldColumn]),
) as Record<string, IdentityFieldColumn>;

/**
 * Fetch the catalog value rows for the two Tier-C identity fields for one
 * talent. Returns a partial object — only keys that HAVE a value row are
 * populated, so the loader can fall back to the dedicated column for absent
 * keys via `??`. Errors are logged + swallowed and return `{}` (full column
 * fallback).
 */
export async function readIdentityFieldValuesFromCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
): Promise<IdentityFieldValueReads> {
  try {
    const { data, error } = await supabase
      .from("talent_profile_field_values")
      .select("value, profile_field_definitions!inner(field_key)")
      .eq("talent_profile_id", talentProfileId)
      .in("profile_field_definitions.field_key", Object.values(IDENTITY_FIELD_KEYS));
    if (error) {
      void improntaLog("identity_field_values.read_failed", {
        talentProfileId,
        error_message: error.message ?? String(error),
      });
      return {};
    }
    const out: IdentityFieldValueReads = {};
    for (const row of (data ?? []) as Array<{
      value: unknown;
      profile_field_definitions: { field_key?: string } | { field_key?: string }[] | null;
    }>) {
      const defEmbed = Array.isArray(row.profile_field_definitions)
        ? row.profile_field_definitions[0]
        : row.profile_field_definitions;
      const key = defEmbed?.field_key;
      if (!key) continue;
      const col = KEY_TO_COLUMN[key];
      if (!col) continue;
      (out as Record<string, unknown>)[col] = typeof row.value === "string" ? row.value : null;
    }
    return out;
  } catch (err) {
    void improntaLog("identity_field_values.read_unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
