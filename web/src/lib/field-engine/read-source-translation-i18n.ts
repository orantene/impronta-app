// src/lib/field-engine/read-source-translation-i18n.ts
//
// TRANSLATION-CENTER I18N ADAPTER value-store seam.
//
// DEAD FIELD-VALUE I18N PATH (T3.2). The `fieldValueTextI18nAdapter` translation
// domain was built around a `field_values.value_i18n` JSONB column that NEVER
// EXISTED in the schema — every read of it returned a 42703 "undefined column"
// error and fell back to a legacy SELECT that carries no i18n status, so the
// adapter has only ever produced zero usable translation units. T3.2 retires
// System A (`field_values`); since the i18n column it depended on never existed,
// this whole field-value translation path is removed rather than repointed:
//   • `readA` (both legs) no longer reads `field_values` — it returns an EMPTY
//     result (the same effective output the broken read always produced).
//   • `readB` (both legs) still THROWS the schema-blocked message: System B
//     (`talent_profile_field_values`) likewise has no `value_i18n` column, so
//     there is nothing to read. The throw keeps `readFieldSurface`'s safe-fallback
//     contract intact (and is asserted by read-source-translation-admin-catalog.test.ts).
//   • the `translation` surface stays at its `a` default — but `a` is now a
//     no-op empty read, not a `field_values` query.
//
// The adapter itself (field-value-text-i18n-adapter.ts) is correspondingly
// neutralized to surface no field-value translation units, and the
// admin-translation-quick-edit.ts `fieldValueTextI18n` load/save branches (which
// read/wrote the non-existent `value_i18n` column) are removed. Re-enabling a
// real per-field i18n workflow is a future feature that must FIRST add a value_i18n
// column to System B + wire a B reader/writer.

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

/** A-leg aggregate reader. T3.2 — the dead `field_values.value_i18n` read is
 *  removed (the column never existed; System A is retired). Returns EMPTY, the
 *  same effective output the broken read always produced. */
async function readTranslationAggregateFromA(
  _supabase: SupabaseClient,
  _args: TranslationReadArgs,
): Promise<TranslationAggregateRow[]> {
  return [];
}

/** System B aggregate reader stub. BLOCKED — B has no `value_i18n` column.
 *  Throws so `readFieldSurface`'s safe-fallback contract is preserved. */
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

/** A-leg list reader. T3.2 — dead `field_values.value_i18n` read removed; returns
 *  EMPTY (same effective output the broken read always produced). */
async function readTranslationListFromA(
  _supabase: SupabaseClient,
  _args: TranslationReadArgs,
): Promise<TranslationListRow[]> {
  return [];
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
