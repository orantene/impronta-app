import { PLAN_CATALOG, type PlanKey } from "./plan-catalog";

/**
 * entitlement-matrix.ts — shaping `plan_capabilities` for a human to read.
 *
 * WHAT THIS SURFACE IS, AND WHAT IT IS NOT
 * ────────────────────────────────────────
 * It is tempting to call this "what each plan includes". It is not, and saying
 * so would be the thirteenth source of plan truth rather than the collapse of
 * the twelve.
 *
 * `plan_capabilities` records DELIBERATE DECISIONS. A missing row means
 * GRANTED — that fail-open default is why introducing the table changed no
 * behaviour, and it means the table can never enumerate what a plan includes,
 * only what somebody chose to withhold or to confirm. Of 101 registered
 * capabilities, six rows exist across three capabilities. The other 98 are
 * granted everywhere by default, and none of that is written down anywhere.
 *
 * So this renders the DECISIONS, with the default stated plainly beside them. A
 * reader must be able to tell "we decided Free does not get this" from "nobody
 * has looked at this yet", because those are different facts and only the first
 * one is packaging.
 */

/** One row as stored. */
export type EntitlementRow = {
  planKey: string;
  capabilityKey: string;
  included: boolean;
  note: string | null;
};

/**
 * How a cell got its answer.
 *   withheld — an explicit `included = false` row. A packaging decision.
 *   granted  — an explicit `included = true` row. Also a decision, recorded so
 *              the matrix reads completely.
 *   default  — NO ROW. Granted by fail-open, and nobody has decided anything.
 */
export type CellState = "withheld" | "granted" | "default";

export type MatrixCell = {
  planKey: PlanKey;
  planName: string;
  state: CellState;
  note: string | null;
};

export type MatrixGroup = {
  capabilityKey: string;
  cells: MatrixCell[];
  /** Rows actually stored for this capability. Zero is impossible here. */
  decidedCount: number;
};

export type EntitlementMatrix = {
  /** Plan columns, in ladder order. */
  plans: { planKey: PlanKey; planName: string }[];
  /** One group per capability that HAS at least one row. Never invented. */
  groups: MatrixGroup[];
  /** Total stored rows. Shown so a reader can check nothing was dropped. */
  rowCount: number;
};

/** Workspace plans, ladder order, excluding archived and invisible ones. */
export function matrixPlanColumns(): { planKey: PlanKey; planName: string }[] {
  return Object.values(PLAN_CATALOG)
    .filter((p) => p.audience === "workspace" && p.isVisible && !p.isArchived)
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ planKey: p.key, planName: p.displayName }));
}

/**
 * Group stored rows by capability.
 *
 * The contract this surface lives or dies by: a capability appears IF AND ONLY
 * IF it has at least one stored row. Rendering all 101 registry keys with 98 of
 * them showing "granted" would present the fail-open default as a decision
 * somebody made, which is exactly the confusion between "we chose this" and
 * "nobody looked" that the audit found everywhere else.
 */
export function buildEntitlementMatrix(
  rows: EntitlementRow[],
): EntitlementMatrix {
  const plans = matrixPlanColumns();
  const byCapability = new Map<string, Map<string, EntitlementRow>>();

  for (const row of rows) {
    let bucket = byCapability.get(row.capabilityKey);
    if (!bucket) {
      bucket = new Map();
      byCapability.set(row.capabilityKey, bucket);
    }
    bucket.set(row.planKey, row);
  }

  const groups: MatrixGroup[] = [...byCapability.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([capabilityKey, bucket]) => ({
      capabilityKey,
      decidedCount: bucket.size,
      cells: plans.map((plan) => {
        const row = bucket.get(plan.planKey);
        return {
          planKey: plan.planKey,
          planName: plan.planName,
          state: (row ? (row.included ? "granted" : "withheld") : "default") as CellState,
          note: row?.note ?? null,
        };
      }),
    }));

  return { plans, groups, rowCount: rows.length };
}
