/**
 * Plan Trials — shared, pure trial-state engine.
 *
 * One engine, two audiences. Both `workspace_plan_overrides` and
 * `talent_plan_overrides` are time-boxed plan grants; a grant whose
 * `grant_kind = 'trial'` and which has an `expires_at` is a TRIAL. This module
 * takes a normalized grant (from either table) and derives the presentation
 * state the badges/popovers render: a live countdown, an "expiring soon"
 * urgency, or a post-expiry upgrade nudge.
 *
 * Pure — no server-only imports — so server loaders, the workspace badge, and
 * the talent surface can all share it.
 */

export type GrantKind = "comp" | "trial" | "promo";

export function isGrantKind(value: unknown): value is GrantKind {
  return value === "comp" || value === "trial" || value === "promo";
}

/** Normalized grant row, audience-agnostic (workspace OR talent). */
export type PlanGrantInput = {
  status: "active" | "expired" | "revoked";
  grantKind: GrantKind;
  /** The granted (effective-while-active) plan key, e.g. "studio" / "talent_pro". */
  grantedPlan: string;
  /** Baseline plan key the grant reverts to, e.g. "free" / "talent_basic". */
  basePlan: string;
  /** ISO start timestamp. */
  startsAt: string;
  /** ISO expiry, or null for an indefinite grant. */
  expiresAt: string | null;
  /** ISO timestamp the grant actually ended (reconcile/revoke), if any. */
  endedAt?: string | null;
};

/**
 * The presentation phase the UI keys off:
 *  - none      → nothing to surface
 *  - comp      → active courtesy/promo or indefinite grant (no countdown)
 *  - active    → live trial with comfortable runway
 *  - expiring  → live trial inside the urgency window (<= EXPIRING_SOON_DAYS)
 *  - expired   → trial ended within the nudge window — show upgrade nudge
 */
export type TrialPhase = "none" | "comp" | "active" | "expiring" | "expired";

export type TrialView = {
  phase: TrialPhase;
  grantKind: GrantKind | null;
  grantedPlan: string;
  basePlan: string;
  /** Whole days remaining (>= 0) for active/expiring; 0 otherwise. */
  daysLeft: number;
  /** Whole days since expiry for the expired phase; 0 otherwise. */
  daysSinceExpiry: number;
  /** Progress through the trial window, 0..1 (for a progress bar). */
  pct: number;
  /** True for active or expiring (a live trial). */
  isActiveTrial: boolean;
};

/** Inside this many days of expiry, a live trial flips to urgent "expiring". */
export const TRIAL_EXPIRING_SOON_DAYS = 7;
/** After expiry, the upgrade nudge shows for this many days, then goes quiet. */
export const TRIAL_EXPIRED_NUDGE_DAYS = 14;

const DAY_MS = 86_400_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Whole days from `fromMs` to `toMs`, floored, never negative. */
function wholeDaysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / DAY_MS));
}

const EMPTY: TrialView = {
  phase: "none",
  grantKind: null,
  grantedPlan: "",
  basePlan: "",
  daysLeft: 0,
  daysSinceExpiry: 0,
  pct: 0,
  isActiveTrial: false,
};

/**
 * Derive the trial presentation state from a normalized grant.
 *
 * Pass the ACTIVE grant if there is one; otherwise pass the most-recent
 * ENDED grant so a just-expired trial can still show its upgrade nudge.
 * Returns the `none` view for null / irrelevant grants.
 */
export function deriveTrialView(
  input: PlanGrantInput | null,
  now: Date = new Date(),
): TrialView {
  if (!input) return EMPTY;

  const { status, grantKind, grantedPlan, basePlan, startsAt, expiresAt, endedAt } =
    input;
  const nowMs = now.getTime();

  // ── Active grant ──────────────────────────────────────────────────────────
  if (status === "active") {
    // Comp / promo, or a trial with no expiry → informational, no countdown.
    if (grantKind !== "trial" || !expiresAt) {
      return { ...EMPTY, phase: "comp", grantKind, grantedPlan, basePlan };
    }

    const endMs = new Date(expiresAt).getTime();
    const startMs = new Date(startsAt).getTime();

    // Past expiry but not yet reconciled → treat as freshly expired.
    if (Number.isFinite(endMs) && endMs <= nowMs) {
      return {
        ...EMPTY,
        phase: "expired",
        grantKind,
        grantedPlan,
        basePlan,
        daysSinceExpiry: wholeDaysBetween(endMs, nowMs),
        pct: 1,
      };
    }

    const daysLeft = Math.max(0, Math.ceil((endMs - nowMs) / DAY_MS));
    const totalMs = Math.max(endMs - startMs, DAY_MS);
    const pct = clamp((nowMs - startMs) / totalMs, 0, 1);
    const phase: TrialPhase =
      daysLeft <= TRIAL_EXPIRING_SOON_DAYS ? "expiring" : "active";

    return {
      phase,
      grantKind,
      grantedPlan,
      basePlan,
      daysLeft,
      daysSinceExpiry: 0,
      pct,
      isActiveTrial: true,
    };
  }

  // ── Ended grant ───────────────────────────────────────────────────────────
  // Only a naturally-expired TRIAL nudges, and only inside the nudge window.
  // (Revoked grants were pulled deliberately — stay quiet.)
  if (status === "expired" && grantKind === "trial") {
    const endRef = endedAt ?? expiresAt;
    if (endRef) {
      const endMs = new Date(endRef).getTime();
      if (Number.isFinite(endMs)) {
        const daysSince = wholeDaysBetween(endMs, nowMs);
        if (daysSince <= TRIAL_EXPIRED_NUDGE_DAYS) {
          return {
            ...EMPTY,
            phase: "expired",
            grantKind,
            grantedPlan,
            basePlan,
            daysSinceExpiry: daysSince,
            pct: 1,
          };
        }
      }
    }
  }

  return EMPTY;
}

/** Short human label for a trial countdown, e.g. "23 days left" / "Last day". */
export function trialCountdownLabel(view: TrialView): string {
  if (view.phase === "active" || view.phase === "expiring") {
    if (view.daysLeft <= 0) return "Ends today";
    if (view.daysLeft === 1) return "1 day left";
    return `${view.daysLeft} days left`;
  }
  if (view.phase === "expired") {
    if (view.daysSinceExpiry <= 0) return "Ended today";
    if (view.daysSinceExpiry === 1) return "Ended yesterday";
    return `Ended ${view.daysSinceExpiry} days ago`;
  }
  return "";
}
