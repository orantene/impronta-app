// src/lib/field-engine/read-source-translation-i18n.ts
//
// T2.5b — TRANSLATION-CENTER I18N ADAPTER value-store seam.
//
// `fieldValueTextI18nAdapter` (translation-center/adapters/field-value-text-i18n-adapter.ts)
// reads `field_values` twice — once in `aggregate` (coverage counts) and once in
// `listUnits` (paginated listing). Both legs use the SAME column set:
//   field_values.id, talent_profile_id, field_definition_id, value_text,
//   value_i18n, talent_profiles(...)
//
// This module lifts those reads behind the shared read-source seam as `readA`
// (byte-identical to today) with a `readB` stub.
//
// WHY readB IS BLOCKED (important for T2.6 planning):
//   `talent_profile_field_values` (System B) stores the primary value in a
//   `value` JSONB column and has NO `value_i18n` column. The translation-center
//   workflow is specifically built around `field_values.value_i18n` — the save
//   path (admin-translation-quick-edit.ts:field_value_i18n) writes translated
//   text back to that A-column. Until `value_i18n` is added to B:
//     1. A B-read would yield source text (from `value` JSONB) but zero i18n
//        status → every unit would appear as health="missing" (regression).
//     2. The entityId threaded through the quick-edit save is the A `field_values.id`.
//        A pure B-repoint would require the save path to also migrate to B row ids.
//   Net: a B-repoint is SCHEMA-GATED. The seam is wired so the flag is already
//   respected at runtime; completing it requires:
//     (a) ALTER TABLE talent_profile_field_values ADD COLUMN value_i18n jsonb;
//     (b) Fill in readB below (join B value + i18n column, project to the same
//         output types: AggregateRow[] / ListRow[]).
//     (c) Update DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS.translation to "b".
//     (d) Update admin-translation-quick-edit.ts to write value_i18n to B.
//
// The `translation` surface therefore DEFAULTS TO `a` (see read-source-types.ts).
// This file exists to wire the seam + document the blocker, so T2.6 can flip
// the flag without touching the adapter.
//
// WRITE INVENTORY (for T2.6 mirror-stop planning — out of scope here):
//   1. admin-translation-quick-edit.ts:190-197 (.update({ value_i18n, value_text,
//      updated_at }).from("field_values").eq("id", entityId).eq("talent_profile_id"))
//      — writes translated text + updates primary EN text for a single field_values row.
//      This is the ONLY i18n write path. It must also write to B's value_i18n
//      before the mirror-stop lands.
//   2. admin-translation-quick-edit.ts:112-115 (.select("id, value_text, value_i18n")
//      .from("field_values").eq("id", entityId)) — a READ in the quick-edit load
//      path (not inventoried above as a write; listed here for completeness).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";

// ── Output shapes (projected from the two SELECT legs in the adapter) ─────────

/** Row shape read by the `aggregate` leg. `value_i18n` may be absent (legacy DB
 *  fallback path) — the adapter handles that gracefully via the `isUndefinedColumn`
 *  guard. */
export type TranslationAggregateRow = {
  value_text: string | null;
  value_i18n?: unknown;
  field_definition_id: string;
  talent_profiles:
    | {
        profile_code: string;
        display_name: string | null;
        workflow_status: string;
        deleted_at: string | null;
      }
    | Array<{
        profile_code: string;
        display_name: string | null;
        workflow_status: string;
        deleted_at: string | null;
      }>
    | null;
};

/** Row shape read by the `listUnits` leg. Adds `id` + the talent_profiles `id`. */
export type TranslationListRow = {
  id: string;
  talent_profile_id: string;
  field_definition_id: string;
  value_text: string | null;
  value_i18n?: unknown;
  talent_profiles:
    | {
        id: string;
        profile_code: string;
        display_name: string | null;
        workflow_status: string;
        deleted_at: string | null;
      }
    | Array<{
        id: string;
        profile_code: string;
        display_name: string | null;
        workflow_status: string;
        deleted_at: string | null;
      }>
    | null;
};

/** Shared argument shape for both legs. */
export type TranslationReadArgs = {
  defIds: readonly string[];
  /** offset + limit are only used by the list leg; aggregate leg ignores them. */
  offset?: number;
  limit?: number;
};

// ── Aggregate leg ─────────────────────────────────────────────────────────────

/** System A aggregate reader — verbatim from the adapter's `aggregate` method.
 *  Tries the WITH_I18N select first; falls back to LEGACY select if `value_i18n`
 *  is not a defined column (matching the adapter's existing guard). */
async function readTranslationAggregateFromA(
  supabase: SupabaseClient,
  { defIds, limit }: TranslationReadArgs,
): Promise<TranslationAggregateRow[]> {
  if (defIds.length === 0) return [];
  const cap = limit ?? 5000;

  const WITH_I18N =
    "id, talent_profile_id, field_definition_id, value_text, value_i18n, talent_profiles ( profile_code, display_name, workflow_status, deleted_at )";
  const LEGACY =
    "id, talent_profile_id, field_definition_id, value_text, talent_profiles ( profile_code, display_name, workflow_status, deleted_at )";

  let { data: aggRows, error } = await supabase
    .from("field_values")
    .select(WITH_I18N)
    .in("field_definition_id", defIds as string[])
    .limit(cap);

  if (error && isUndefinedColumn(error, "value_i18n")) {
    const legacy = await supabase
      .from("field_values")
      .select(LEGACY)
      .in("field_definition_id", defIds as string[])
      .limit(cap);
    aggRows = legacy.data as typeof aggRows;
    error = legacy.error;
  }

  if (error) throw new Error(`[translation] aggregate A: ${error.message}`);
  return (aggRows ?? []) as TranslationAggregateRow[];
}

/** System B aggregate reader stub. BLOCKED — B has no `value_i18n` column yet.
 *  Throws immediately so the safe-fallback in `readFieldSurface` degrades to A. */
async function readTranslationAggregateFromB(
  _supabase: SupabaseClient,
  _args: TranslationReadArgs,
): Promise<TranslationAggregateRow[]> {
  throw new Error(
    "[translation] B aggregate reader not yet implemented: " +
      "talent_profile_field_values has no value_i18n column. " +
      "See T2.5b read-source-translation-i18n.ts for the schema unblock plan.",
  );
}

/** The aggregate reader pair. Exposed so a test/diagnostic can run both side
 *  by side without going through the env flag. */
export const translationAggregateReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, TranslationReadArgs],
  TranslationAggregateRow[]
> = {
  readA: readTranslationAggregateFromA,
  readB: readTranslationAggregateFromB,
};

/**
 * PUBLIC entry — read aggregate rows for the translation-center coverage count,
 * routing through the `translation` surface flag. Since the surface defaults to
 * `a` and the B-reader throws (schema-blocked), this always reads A at runtime.
 * When the schema addition (value_i18n on B) lands and the default is flipped,
 * the B-reader will be activated without caller changes.
 */
export function readTranslationAggregateRows(
  supabase: SupabaseClient,
  args: TranslationReadArgs,
): Promise<TranslationAggregateRow[]> {
  return readFieldSurface("translation", translationAggregateReaderPair, supabase, args);
}

// ── List-units leg ────────────────────────────────────────────────────────────

/** System A list reader — verbatim from the adapter's `listUnits` method. */
async function readTranslationListFromA(
  supabase: SupabaseClient,
  { defIds, offset = 0, limit = 50 }: TranslationReadArgs,
): Promise<TranslationListRow[]> {
  if (defIds.length === 0) return [];

  const WITH_I18N =
    "id, talent_profile_id, field_definition_id, value_text, value_i18n, talent_profiles ( id, profile_code, display_name, workflow_status, deleted_at )";
  const LEGACY =
    "id, talent_profile_id, field_definition_id, value_text, talent_profiles ( id, profile_code, display_name, workflow_status, deleted_at )";

  let { data: listRows, error } = await supabase
    .from("field_values")
    .select(WITH_I18N)
    .in("field_definition_id", defIds as string[])
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error && isUndefinedColumn(error, "value_i18n")) {
    const legacy = await supabase
      .from("field_values")
      .select(LEGACY)
      .in("field_definition_id", defIds as string[])
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    listRows = legacy.data as typeof listRows;
    error = legacy.error;
  }

  if (error) throw new Error(`[translation] list A: ${error.message}`);
  return (listRows ?? []) as TranslationListRow[];
}

/** System B list reader stub. BLOCKED — same reason as aggregate. */
async function readTranslationListFromB(
  _supabase: SupabaseClient,
  _args: TranslationReadArgs,
): Promise<TranslationListRow[]> {
  throw new Error(
    "[translation] B list reader not yet implemented: " +
      "talent_profile_field_values has no value_i18n column. " +
      "See T2.5b read-source-translation-i18n.ts for the schema unblock plan.",
  );
}

/** The list reader pair. */
export const translationListReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, TranslationReadArgs],
  TranslationListRow[]
> = {
  readA: readTranslationListFromA,
  readB: readTranslationListFromB,
};

/**
 * PUBLIC entry — read paginated list rows for the translation-center unit list,
 * routing through the `translation` surface flag. See aggregate entry for the
 * B-blocked status.
 */
export function readTranslationListRows(
  supabase: SupabaseClient,
  args: TranslationReadArgs,
): Promise<TranslationListRow[]> {
  return readFieldSurface("translation", translationListReaderPair, supabase, args);
}

// ── Shared helper (mirrors the adapter's isUndefinedColumn) ───────────────────

function isUndefinedColumn(err: unknown, columnSqlName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const msg = String(e.message ?? "");
  return e.code === "42703" && msg.includes(columnSqlName);
}
