/**
 * Shared policy for the TWO sweeps that alert on an inquiry nobody is driving.
 *
 *   1. `processCoordinatorTimeouts` (cron /api/cron/inquiry-engine)
 *      — a coordinator WAS assigned but never accepted within
 *        `coordinator_timeout_hours`; the sweep unassigns them.
 *   2. `/api/cron/flag-unassigned-inquiries`
 *      — an inquiry has had NO coordinator since submission.
 *
 * Both raise the same `coordinator.assignment_timed_out` event, so without a
 * shared anchor they alert the same inquiry twice: sweep 1 strips
 * `coordinator_id`, and an hour later sweep 2 sees a now-unassigned inquiry and
 * alerts again. This module owns the two rules that keep them in step.
 *
 * RULE 1 — SHARED IDEMPOTENCY ANCHOR (`COORDINATOR_STALE_ANCHOR_EVENT`).
 * The `inquiry_events` row of type `coordinator.assignment_timed_out` is the
 * single anchor. BOTH sweeps must check it before alerting and BOTH must write
 * it (via the `engine_emit_system_event` SECURITY DEFINER RPC) when they act.
 * NOTE: `emitStandardEngineEvent` does NOT write an `inquiry_events` row — it
 * only runs the listener chain (system message, bell, log, email). That is
 * precisely why sweep 1 used to leave no anchor behind. Writing the anchor is a
 * separate, explicit RPC call.
 *
 * RULE 2 — STALENESS CUTOFF (`NOTIFY_MAX_STALENESS_HOURS`).
 * A sweep that has never run accumulates a backlog. Switching it on would fire
 * one alert per row for drift that is months old — noise, not signal, and it
 * lands in staff inboxes all at once. So an alert is only *notified* when the
 * staleness is recent. Older rows are still processed and still get their
 * timeline row + anchor (so they never re-alert), but the notification
 * side-effects are suppressed. Both sweeps run hourly and a row becomes
 * eligible within hours, so a genuine event is always inside the cutoff —
 * the window below is a wide margin over that, not a tight bound.
 */

/**
 * The single `inquiry_events.event_type` both sweeps use as their dedupe anchor.
 * Mirrors `ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNMENT_TIMED_OUT`; kept as a
 * standalone literal so this module stays dependency-free and unit-testable.
 */
export const COORDINATOR_STALE_ANCHOR_EVENT = "coordinator.assignment_timed_out";

/**
 * Only notify when the inquiry went stale within this many hours. Three days:
 * both sweeps run hourly against thresholds measured in hours, so a live event
 * is detected far inside this window. Anything older is accumulated backlog and
 * is drained quietly.
 */
export const NOTIFY_MAX_STALENESS_HOURS = 72;

/** What a sweep should do about ONE row it has selected as stale. */
export type StaleAlertAction =
  /** An anchor already exists — this inquiry was alerted before. Do nothing. */
  | "skip"
  /** Write the anchor + timeline row, but suppress notifications (old backlog). */
  | "drain"
  /** Write the anchor + timeline row AND notify staff. */
  | "notify";

export type StaleAlertInput = {
  /** True when an `inquiry_events` anchor row already exists for this inquiry. */
  alreadyAnchored: boolean;
  /**
   * When this inquiry became stale — `coordinator_assigned_at` for sweep 1,
   * `created_at` for sweep 2. A null/unparseable value is treated as unbounded
   * staleness and drained rather than notified (never guess loudly).
   */
  staleSinceIso: string | null | undefined;
  /** Evaluation time, ms since epoch. Injected so the rule is pure/testable. */
  nowMs: number;
  /** Override the notify window. Defaults to `NOTIFY_MAX_STALENESS_HOURS`. */
  maxStalenessHours?: number;
};

/**
 * Hours elapsed since `iso`, or null when the value is absent/unparseable.
 * A timestamp in the future yields a negative number (clock skew) — callers
 * treat that as "fresh", which is the safe direction for a notify decision.
 */
export function stalenessHours(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (nowMs - then) / (60 * 60 * 1000);
}

/**
 * Decide what to do about one stale row. This is the ONLY place the
 * anchor-then-cutoff precedence lives, so both sweeps cannot drift apart:
 * an existing anchor always wins ("skip"), otherwise the cutoff picks between
 * a quiet drain and a real alert.
 */
export function classifyStaleAlert(input: StaleAlertInput): StaleAlertAction {
  if (input.alreadyAnchored) return "skip";

  const limit = input.maxStalenessHours ?? NOTIFY_MAX_STALENESS_HOURS;
  const hours = stalenessHours(input.staleSinceIso, input.nowMs);

  // Unknown staleness: record it, but do not shout about it.
  if (hours === null) return "drain";

  return hours <= limit ? "notify" : "drain";
}

/** Convenience predicate — true only for the "notify" branch. */
export function shouldNotifyForStaleness(input: StaleAlertInput): boolean {
  return classifyStaleAlert(input) === "notify";
}
