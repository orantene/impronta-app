// ============================================================================
// reconcile-field-mirror.ts — TRANSITIONAL A→B drift backstop (T1.2b → T2.6).
//
// WHY THIS EXISTS — SCAFFOLDING ONLY, REMOVE AT PHASE 3
// Historically the app dual-wrote the 17 bridged keys between System A
// (`field_values`) and System B (`talent_profile_field_values`). T2.6 step 3
// removed the B→A mirror entirely — the product write paths now write System B
// ONLY. System A is FROZEN (existing data preserved, no new writes).
//
// This module is now a SAFE near-no-op: it still detects A↔B drift via the
// read-only RPC, but only ever heals in the A→B direction (rebuild a stale B
// row from a leftover A row). Because B is already a proven superset of A
// (T1.2a: 0 A-only) and nothing writes A anymore, a steady-state run heals 0.
// The B→A leg — which used to resurrect legacy `field_values` rows — is GONE;
// the cron must never write System A again now that it's frozen.
//
// It is invoked nightly by `web/src/app/api/cron/reconcile-field-mirror`.
//
// TRANSITIONAL — Phase 3 drops System A entirely, after which this whole
// module + its cron route become a true no-op and should be deleted alongside
// `legacy-mirror.ts`.
//
// DESIGN — REUSE THE PROVEN TS MIRROR, never hand-roll slug↔label in SQL:
//   1. ONE consolidated detection query — the `reconcile_field_mirror_drift`
//      RPC (a read-only SECURITY DEFINER function, modelled on field-parity-
//      harness.mjs) returns the per-(talent, key) drift rows for the 17 bridged
//      keys, classified a_only / b_only / disagree, with the raw A typed-columns
//      and the raw B jsonb scalar. Called through the SERVICE-ROLE PostgREST
//      client the cron already has (no Management-API token at runtime).
//   2. For a_only / disagree rows we re-apply `mirrorWriteToCanonical` (A→B),
//      so the slug→label translation stays byte-identical to the live path.
//      b_only rows are NO LONGER healed (the B→A mirror is retired + A is
//      frozen) — they are counted + reported only, never written back to A.
//   Idempotent: a clean run heals 0. DB load is bounded — one detection query
//   plus targeted per-drift heals (no fan-out); the cron runs off-peak.
// ============================================================================

import {
  NEW_TO_OLD_KEY,
  mirrorWriteToCanonical,
  type MirrorSupabase,
} from "@/lib/fields/legacy-mirror";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";

/** The read-only SECURITY DEFINER RPC that returns the drift rows. Defined in
 *  supabase/migrations/20260611053052_reconcile_field_mirror_drift_rpc.sql. */
export const DRIFT_RPC = "reconcile_field_mirror_drift";

/** The 17 bridged legacy keys, derived once from the canonical bridge map so
 *  this module and `legacy-mirror.ts` can never drift on the key-set. */
const BRIDGED_LEGACY_KEYS = Object.values(NEW_TO_OLD_KEY);

/** One drift row as returned by the consolidated detection query. */
type DriftRow = {
  b_key: string;
  a_key: string;
  talent_profile_id: string;
  // Classification — exactly one of these is true per row.
  a_only: boolean;
  b_only: boolean;
  disagree: boolean;
  // System A typed columns (only the relevant one is non-null), so we can
  // rebuild the NATIVE scalar the same way the live shell write does (it
  // coalesces the typed columns before calling the mirror).
  a_value_text: string | null;
  a_value_number: number | null;
  a_value_boolean: boolean | null;
  a_value_date: string | null;
  // System B jsonb scalar as text. Retained in the RPC return shape; no longer
  // consumed now that the B→A heal is gone (b_only rows are reported, not healed).
  b_value_text: string | null;
};

export type ReconcileResult = {
  scanned_keys: number;
  drift_total: number;
  a_only: number;
  // b_only rows are detected + reported only. Since T2.6 step 3 retired the B→A
  // mirror and froze System A, the cron NEVER writes A back — a b_only row just
  // means an A row was deleted while B kept the value (the correct end state).
  b_only: number;
  disagree: number;
  healed_a_to_b: number;
  errors: number;
};

/** Rebuild the NATIVE scalar from System A's typed columns, exactly the way
 *  the live shell write path coalesces them before calling the mirror. */
function aNativeScalar(row: DriftRow): string | number | boolean | null {
  return (
    row.a_value_text ??
    row.a_value_number ??
    row.a_value_boolean ??
    row.a_value_date ??
    null
  );
}

/**
 * Run the reconcile sweep: detect A↔B drift on the 17 bridged keys and heal
 * each drifted (talent, key) in the A→B direction ONLY. Idempotent.
 *
 * Detection uses ONE consolidated read-only RPC (`reconcile_field_mirror_drift`,
 * modelled on the parity harness) executed through the service-role PostgREST
 * client — one round-trip, no Management-API token at runtime. The heal then
 * re-applies `mirrorWriteToCanonical` (A→B) for a_only/disagree rows. b_only
 * rows are reported but NOT healed — T2.6 step 3 retired the B→A mirror and
 * froze System A, so the cron must never write A. Because B is a proven
 * superset (T1.2a) and nothing writes A anymore, a steady-state run heals 0.
 */
export async function reconcileFieldMirror(
  supabase: MirrorSupabase,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scanned_keys: BRIDGED_LEGACY_KEYS.length,
    drift_total: 0,
    a_only: 0,
    b_only: 0,
    disagree: 0,
    healed_a_to_b: 0,
    errors: 0,
  };

  let driftRows: DriftRow[];
  try {
    driftRows = await detectDrift(supabase);
  } catch (err) {
    logServerError("reconcile-field-mirror.detect", err);
    result.errors += 1;
    return result;
  }

  result.drift_total = driftRows.length;

  for (const row of driftRows) {
    if (row.a_only) result.a_only += 1;
    else if (row.b_only) result.b_only += 1;
    else if (row.disagree) result.disagree += 1;

    // Only a_only / disagree rows get healed (A→B). b_only rows are the
    // post-cutover steady state (A frozen / deleted, B authoritative) — count
    // them for observability but never write System A back.
    if (!row.a_only && !row.disagree) continue;

    try {
      // A→B heal: re-apply the live-path canonical mirror with the native A
      // scalar. mirrorWriteToCanonical does the slug→label translation.
      await mirrorWriteToCanonical(
        supabase,
        row.a_key,
        row.talent_profile_id,
        aNativeScalar(row),
      );
      result.healed_a_to_b += 1;
    } catch (err) {
      logServerError(`reconcile-field-mirror.heal[${row.b_key}]`, err);
      result.errors += 1;
    }
  }

  void improntaLog("field.reconcile.sweep", { ...result });
  return result;
}

// ---------------------------------------------------------------------------
// detectDrift — ONE round-trip through the service-role PostgREST client via
// the read-only SECURITY DEFINER RPC. Reuses the harness's proven def-resolution
// + normalization SQL (now inside the function body), no PostgREST fan-out.
// ---------------------------------------------------------------------------
async function detectDrift(supabase: MirrorSupabase): Promise<DriftRow[]> {
  const { data, error } = await supabase.rpc(DRIFT_RPC);
  if (error) {
    throw new Error(error.message ?? String(error));
  }
  return (Array.isArray(data) ? data : []) as DriftRow[];
}
