// ============================================================================
// reconcile-field-mirror.ts — TRANSITIONAL A↔B drift backstop (T1.2b).
//
// WHY THIS EXISTS — SCAFFOLDING ONLY, REMOVE AT PHASE 3
// The app dual-writes the 17 bridged keys between System A (`field_values`)
// and System B (`talent_profile_field_values`) via `legacy-mirror.ts`. Those
// mirror writes are FIRE-AND-FORGET — errors are logged + swallowed — so a
// failed mirror leaves silent A↔B drift with no self-heal. T1.2a made B a
// superset (0 A-only) and T1.1 added column-sync triggers; this module closes
// the remaining gap with a periodic re-detect + re-heal sweep.
//
// It is invoked nightly by `web/src/app/api/cron/reconcile-field-mirror`.
//
// TRANSITIONAL — this is scaffolding for the transition window only:
//   - Phase 2.6 stops the B→A mirror → set ENGINE_LEGACY_MIRROR_ACTIVE=0 (or
//     unset) and this job heals A→B only.
//   - Phase 3 drops System A entirely → this whole module + its cron route
//     become a no-op and should be deleted alongside `legacy-mirror.ts`.
//
// DESIGN — REUSE THE PROVEN TS MIRROR, never hand-roll slug↔label in SQL:
//   1. ONE consolidated detection query — the `reconcile_field_mirror_drift`
//      RPC (a read-only SECURITY DEFINER function, modelled on field-parity-
//      harness.mjs) returns the per-(talent, key) drift rows for the 17 bridged
//      keys, classified a_only / b_only / disagree, with the raw A typed-columns
//      and the raw B jsonb scalar. Called through the SERVICE-ROLE PostgREST
//      client the cron already has (no Management-API token at runtime).
//   2. For each drift row we re-apply the SAME helper the live write path uses:
//        - a_only / disagree → mirrorWriteToCanonical (A→B), so the slug→label
//          translation stays byte-identical to the live path.
//        - b_only            → mirrorWriteToLegacy (B→A), only while the legacy
//          mirror is still active (ENGINE_LEGACY_MIRROR_ACTIVE).
//   Idempotent: a clean run heals 0. DB load is bounded — one detection query
//   plus targeted per-drift heals (no fan-out); the cron runs off-peak.
// ============================================================================

import {
  NEW_TO_OLD_KEY,
  mirrorWriteToCanonical,
  mirrorWriteToLegacy,
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

/** B→A heal is gated so Phase 2.6 can stop the legacy mirror without a code
 *  change. Active (the current transition state) unless explicitly disabled.
 *  Matches the contract documented in this module's header. */
export function isLegacyMirrorActive(): boolean {
  const v = process.env.ENGINE_LEGACY_MIRROR_ACTIVE;
  // Default ACTIVE — only an explicit "0" / "false" turns the B→A heal off.
  return v !== "0" && v !== "false";
}

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
  // System B jsonb scalar as text (what mirrorWriteToLegacy consumes).
  b_value_text: string | null;
};

export type ReconcileResult = {
  scanned_keys: number;
  drift_total: number;
  a_only: number;
  b_only: number;
  disagree: number;
  healed_a_to_b: number;
  healed_b_to_a: number;
  skipped_b_to_a_legacy_off: number;
  errors: number;
  legacy_mirror_active: boolean;
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
 * Run the reconcile sweep: detect A↔B drift on the 17 bridged keys and re-heal
 * each drifted (talent, key) by re-applying the proven TS mirror. Idempotent.
 *
 * Detection uses ONE consolidated read-only RPC (`reconcile_field_mirror_drift`,
 * modelled on the parity harness) executed through the service-role PostgREST
 * client — one round-trip, no Management-API token at runtime. The heal then
 * re-applies `mirrorWriteToCanonical` (A→B) / `mirrorWriteToLegacy` (B→A) per
 * drift row.
 */
export async function reconcileFieldMirror(
  supabase: MirrorSupabase,
): Promise<ReconcileResult> {
  const legacyActive = isLegacyMirrorActive();
  const result: ReconcileResult = {
    scanned_keys: BRIDGED_LEGACY_KEYS.length,
    drift_total: 0,
    a_only: 0,
    b_only: 0,
    disagree: 0,
    healed_a_to_b: 0,
    healed_b_to_a: 0,
    skipped_b_to_a_legacy_off: 0,
    errors: 0,
    legacy_mirror_active: legacyActive,
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

    try {
      if (row.a_only || row.disagree) {
        // A→B heal: re-apply the live-path canonical mirror with the native A
        // scalar. mirrorWriteToCanonical does the slug→label translation.
        await mirrorWriteToCanonical(
          supabase,
          row.a_key,
          row.talent_profile_id,
          aNativeScalar(row),
        );
        result.healed_a_to_b += 1;
      } else if (row.b_only) {
        if (!legacyActive) {
          // Phase 2.6+: the B→A mirror is retired; do NOT resurrect legacy rows.
          result.skipped_b_to_a_legacy_off += 1;
          continue;
        }
        // B→A heal: re-apply the live-path legacy mirror. It needs the canonical
        // (System B) value + the new field key + kind. The mirror resolves the
        // legacy def + coerces to typed columns; pass the B scalar text.
        await mirrorWriteToLegacy(
          supabase,
          /* newKind */ "text",
          row.talent_profile_id,
          row.b_key,
          row.b_value_text,
        );
        result.healed_b_to_a += 1;
      }
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
