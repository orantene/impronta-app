// ============================================================================
// blob-field-values-catalog.ts — Tier B dual-write helper (P3, field-engine
// value unification). Modeled on scalar-field-values-catalog.ts (Tier A) and
// roster-field-values-catalog.ts (Tier D), the proven templates merged on main.
//
// The Tier-B fields are EDITOR-ONLY JSONB BLOBS that persist VERBATIM to
// dedicated jsonb columns on `talent_profiles`. There is no per-cell schema —
// the whole jsonb document is the value, stored as-is in the catalog value
// table. Column → registry key map (verified against the live DB):
//   bios               (jsonb[])  → bios
//   personality_traits (jsonb[])  → about.personality
//   rates_data         (jsonb[])  → rates.cards
//   package_rates_data (jsonb[])  → commercial.packageRates
//   rate_tiers_data    (jsonb[])  → commercial.rateTiers
//   credits_data       (jsonb[])  → credits
//   limits_data        (jsonb{})  → limits
//   social_proof_data  (jsonb[])  → social_proof.pastClients
//   work_eligibility   (jsonb[])  → logistics.workEligibility
//   upcoming_visits    (jsonb[])  → logistics.upcomingVisits   (registered by this tier)
//   media_albums_data  (jsonb[])  → albums.list
//   documents_data     (jsonb[])  → documents
//
// CARVE-OUT — `availability_data` is JSONB too but powers booking queries; it
// is NEVER migrated and not handled here.
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
// ─── TENANT scoping (same as Tier A) ────────────────────────────────────────
// These columns live on `talent_profiles`, which is GLOBAL / un-tenanted (one
// value per talent). The value table needs a `tenant_id`, supplied by the
// caller from the talent's ACTIVE roster. A no-roster (independent,
// self-registered) talent has NO tenant → we SKIP the value-row write entirely;
// the dedicated column stays the source and the read-flip falls back to it.
//
// ─── EMPTINESS contract per blob ────────────────────────────────────────────
// Shared verbatim with the backfill migration + parity SQL so all three agree
// on which rows get a value row:
//   ARRAY blobs  present ⇔ jsonb_array_length(col) > 0
//   OBJECT blobs present ⇔ col <> '{}'  (only `limits_data` is an object blob)
// When a blob is "empty" the helper DELETEs any stale value row so the two
// stores never diverge.
//
// The value-table unique key is (talent_profile_id, field_definition_id) — ONE
// row per talent per field — matching the upsert onConflict.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";

// Canonical registry keys for the twelve Tier-B blob fields, keyed by the
// talent_profiles column name they mirror.
export const BLOB_FIELD_KEYS = {
  bios: "bios",
  personality_traits: "about.personality",
  rates_data: "rates.cards",
  package_rates_data: "commercial.packageRates",
  rate_tiers_data: "commercial.rateTiers",
  credits_data: "credits",
  limits_data: "limits",
  social_proof_data: "social_proof.pastClients",
  work_eligibility: "logistics.workEligibility",
  upcoming_visits: "logistics.upcomingVisits",
  media_albums_data: "albums.list",
  documents_data: "documents",
  // Talent services menu (2026-06-14) — the priced menu that feeds offers /
  // instant-book. ARRAY blob (ServiceMenuItem[]); catalog field
  // commerce.servicesMenu registered alongside rates.cards / commercial.*.
  services_menu: "commerce.servicesMenu",
} as const;

export type BlobFieldColumn = keyof typeof BLOB_FIELD_KEYS;

// `limits_data` is the only OBJECT blob; every other column is an ARRAY blob.
// This split selects the emptiness predicate (array length vs `<> {}`).
const OBJECT_BLOB_COLUMNS = new Set<BlobFieldColumn>(["limits_data"]);

// The helper accepts the deeply-generic Supabase client OR the service-role
// client; both flow through the same query surface. `any` keeps the helper
// readable + isolated, mirroring scalar-field-values-catalog.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient | any;

// Only keys PRESENT (not `undefined`) are touched — an absent key means the
// caller didn't edit it. A present value is the verbatim jsonb blob (array or
// object), or null (which is treated as empty → delete).
export type BlobFieldValues = Partial<Record<BlobFieldColumn, unknown>>;

/** True when an ARRAY blob carries a real value (a non-empty array). A
 *  non-array (null/object/other) is NOT a present array blob → empty. */
function arrayBlobPresent(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/** True when an OBJECT blob carries a real value (a non-empty plain object).
 *  null / array / empty object → empty. */
function objectBlobPresent(v: unknown): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.keys(v as Record<string, unknown>).length > 0;
}

/** Apply the per-column emptiness contract. */
function blobPresent(col: BlobFieldColumn, v: unknown): boolean {
  return OBJECT_BLOB_COLUMNS.has(col) ? objectBlobPresent(v) : arrayBlobPresent(v);
}

/**
 * Dual-write the supplied Tier-B blobs into `talent_profile_field_values`.
 * Only keys PRESENT in `fields` are touched. A present key whose blob is empty
 * (per the contract above) DELETEs any stale value row; a present key with a
 * non-empty blob upserts the value row with the blob stored VERBATIM.
 *
 * When `tenantId` is null (no active roster) the write is SKIPPED entirely —
 * the column stays the source for independent talents.
 *
 * Fire-and-forget: every failure is logged + swallowed. Never throws; never
 * blocks the column write the caller already performed.
 */
export async function syncBlobFieldValuesToCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
  tenantId: string | null,
  fields: BlobFieldValues,
): Promise<void> {
  try {
    // No tenant (independent talent) → the value table needs a tenant; skip.
    if (!tenantId) return;

    // Which canonical keys did the caller actually edit, and are they present?
    const edits: Array<{ key: string; present: boolean; value: unknown }> = [];
    for (const [col, fieldKey] of Object.entries(BLOB_FIELD_KEYS) as Array<
      [BlobFieldColumn, string]
    >) {
      const raw = (fields as Record<string, unknown>)[col];
      if (raw === undefined) continue; // untouched
      const present = blobPresent(col, raw);
      edits.push({ key: fieldKey, present, value: present ? raw : null });
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
      void improntaLog("blob_field_values.def_lookup_failed", {
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
          void improntaLog("blob_field_values.delete_failed", {
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
        void improntaLog("blob_field_values.upsert_failed", {
          talentProfileId,
          field_key: edit.key,
          error_message: upErr.message ?? String(upErr),
        });
      }
    }
  } catch (err) {
    void improntaLog("blob_field_values.unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// readBlobFieldValuesFromCatalog — Stage-4 read source.
//
// After parity is proven, the loaders source these blobs from the catalog
// value row FIRST, falling back to the dedicated column when no value row
// exists. The dual-write keeps the value table fresh; this read makes the
// catalog the live source while the column remains a safety net (kept until
// Stage 5). Each blob comes back VERBATIM (the stored jsonb) or is absent
// (no value row) so the loader can fall back to the column via `??`.
// ---------------------------------------------------------------------------

export type BlobFieldValueReads = Partial<Record<BlobFieldColumn, unknown>>;

// Reverse map: field_key → the talent_profiles column name.
const KEY_TO_COLUMN: Record<string, BlobFieldColumn> = Object.fromEntries(
  Object.entries(BLOB_FIELD_KEYS).map(([col, key]) => [key, col as BlobFieldColumn]),
) as Record<string, BlobFieldColumn>;

/**
 * Fetch the catalog value rows for the twelve Tier-B blobs for one talent.
 * Returns a partial object — only keys that HAVE a value row are populated, so
 * the loader can fall back to the dedicated column for absent keys via `??`.
 * Errors are logged + swallowed and return `{}` (full column fallback).
 */
export async function readBlobFieldValuesFromCatalog(
  supabase: AnySupabase,
  talentProfileId: string,
): Promise<BlobFieldValueReads> {
  try {
    const { data, error } = await supabase
      .from("talent_profile_field_values")
      .select("value, profile_field_definitions!inner(field_key)")
      .eq("talent_profile_id", talentProfileId)
      .in("profile_field_definitions.field_key", Object.values(BLOB_FIELD_KEYS));
    if (error) {
      void improntaLog("blob_field_values.read_failed", {
        talentProfileId,
        error_message: error.message ?? String(error),
      });
      return {};
    }
    const out: BlobFieldValueReads = {};
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
      (out as Record<string, unknown>)[col] = row.value;
    }
    return out;
  } catch (err) {
    void improntaLog("blob_field_values.read_unexpected", {
      talentProfileId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
