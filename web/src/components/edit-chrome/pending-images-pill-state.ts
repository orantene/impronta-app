/**
 * Pure visibility state for the "Your photos are being made" pill (TUL-81).
 *
 * The pill used to show for as long as any slot kept a pending job id, so a job
 * that never finished left it on screen forever. It now ends in one of:
 *   - hidden (nothing pending, the user dismissed it, or the wait timed out)
 *   - "done"   short confirmation after pending slots all cleared
 *   - "failed" the wait outlived the TTL, or the poll kept failing mid-run
 */

/** A pending set that has not cleared after this long is treated as stuck. */
export const PENDING_PILL_STALE_MS = 3 * 60_000;
/** How long the done / failed message stays up. */
export const PENDING_PILL_RESULT_MS = 4_000;
/** Consecutive poll failures (while pending) before we call it failed. */
export const PENDING_PILL_MAX_POLL_ERRORS = 3;

export type PillState =
  | { kind: "hidden" }
  | { kind: "progress"; count: number; total: number }
  | { kind: "done" }
  | { kind: "failed"; reason: "stale" | "poll" };

export type PillInput = {
  /** Slots still pending right now. */
  pending: number;
  /** Slots that were pending when this run began (>= pending). */
  total: number;
  /** Epoch ms when pending first became > 0 in this run; null if idle. */
  startedAt: number | null;
  now: number;
  /** User pressed the close button for this run. */
  dismissed: boolean;
  /** Consecutive poll failures while a run was in flight. */
  pollErrors: number;
  /** A terminal outcome already decided for this run (sticky until hidden). */
  outcome: "done" | "failed-stale" | "failed-poll" | null;
  /** Epoch ms when `outcome` was set. */
  outcomeAt: number | null;
};

export function resolvePillState(i: PillInput): PillState {
  if (i.dismissed) return { kind: "hidden" };
  if (i.outcome) {
    if (i.outcomeAt !== null && i.now - i.outcomeAt > PENDING_PILL_RESULT_MS) {
      return { kind: "hidden" };
    }
    return i.outcome === "done"
      ? { kind: "done" }
      : { kind: "failed", reason: i.outcome === "failed-stale" ? "stale" : "poll" };
  }
  if (i.pending <= 0) return { kind: "hidden" };
  return { kind: "progress", count: i.pending, total: Math.max(i.total, i.pending) };
}

/** What outcome (if any) the current poll result should latch. */
export function nextOutcome(args: {
  pending: number;
  hadPending: boolean;
  startedAt: number | null;
  now: number;
  pollErrors: number;
}): PillInput["outcome"] {
  if (args.hadPending && args.pending === 0 && args.pollErrors === 0) return "done";
  if (args.pending > 0 && args.startedAt !== null && args.now - args.startedAt > PENDING_PILL_STALE_MS) {
    return "failed-stale";
  }
  if (args.hadPending && args.pollErrors >= PENDING_PILL_MAX_POLL_ERRORS) return "failed-poll";
  return null;
}
