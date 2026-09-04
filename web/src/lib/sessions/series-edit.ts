/**
 * series-edit.ts — "this one, or all future?", decided rather than assumed.
 *
 * PURE. No Supabase import, so it gates in every lane. The write path calls
 * this and does what it says; the editor calls the SAME function to show what
 * an edit is about to do, before the operator commits to it.
 *
 *
 * THE QUESTION EVERY RECURRING-THING EDITOR HAS TO ANSWER
 * ══════════════════════════════════════════════════════
 * An operator changes "Tuesdays at 18:00" to 19:00. There are already
 * occurrences in the table, some sold, some empty, some in the past. Doing the
 * obvious thing — rewrite them all — moves a class somebody bought a seat for,
 * and doing the other obvious thing — leave them all — means the edit did
 * nothing visible and the operator repeats it.
 *
 * So the edit is a decision with four buckets, and this returns them so a human
 * can see the shape before agreeing to it:
 *
 *   untouched   the past. Never rewritten, never deleted. A session that has
 *               happened is a fact, and editing a fact is how a schedule stops
 *               being evidence of what occurred.
 *   rescheduled future occurrences with NO admissions. Safe to move.
 *   protected   future occurrences WITH admissions. NOT moved: somebody holds a
 *               seat at a stated time. Moving it silently is the calendar
 *               equivalent of taking a seat back from someone who paid, which
 *               this area already ruled against for capacity.
 *   removed     future occurrences the new shape no longer produces (a weekday
 *               dropped from the series) and which nobody holds. Cancelled,
 *               never deleted — see below.
 *
 *
 * CANCELLED, NOT DELETED, AND THE REASON IS NOT SENTIMENT
 * ══════════════════════════════════════════════════════
 * `status='cancelled'` plus deactivating the pool, exactly as Capacity
 * deactivates rather than deletes a pool: the allocations under it are the
 * record of what was sold, and a delete cascades that record away. A dispute is
 * settled by what the rows say, so the rows have to survive the edit that made
 * them irrelevant.
 *
 *
 * WHY THE EDITOR CALLS THIS TOO, RATHER THAN DESCRIBING IT
 * ═══════════════════════════════════════════════════════
 * A preview computed by different code from the write is two implementations of
 * one rule that agree until they do not, and the day they disagree the operator
 * has approved something other than what happened. Same argument as calling
 * `decideMaterialisation` at read time instead of persisting its output: the
 * surface is not a copy of the behaviour, it is the behaviour.
 */

/**
 * The half of an occurrence this decision needs: when it starts and ends.
 *
 * Deliberately NOT `Occurrence` from `./recurrence`. That type also carries the
 * wall-clock resolution `kind`, which matters to the materialiser's collision
 * rule and is irrelevant here — an edit plan does not care how an instant was
 * resolved, only what it is. Taking the wider type would have coupled this
 * module to a field it never reads, and structurally: it would have made this
 * file un-mergeable until the PR that adds `kind` lands, for no reason.
 *
 * A structural subset also means `Occurrence` satisfies it, so callers pass
 * expander output directly with no mapping.
 */
export type PlannedOccurrence = {
  startsAt: string;
  endsAt: string;
  localDate: string;
};

/** An occurrence already in `sessions`, as this decision needs it. */
export type ExistingSession = {
  id: string;
  /** ISO instant, as `sessions.starts_at` serialises. */
  startsAt: string;
  /**
   * Does anyone hold a seat at this occurrence?
   *
   * Deliberately a boolean supplied by the caller rather than a count read
   * here: "has admissions" is a question about Events' table, and this module
   * stays pure. The caller answers it; this decides what it means.
   */
  hasAdmissions: boolean;
  status: string;
};

export type SeriesEditScope = "this_one" | "all_future";

export type SeriesEditPlan = {
  /** Past occurrences. Never touched, listed so the operator sees the line. */
  untouched: ExistingSession[];
  /** Future, unsold, still produced by the new shape: move them. */
  rescheduled: Array<{ session: ExistingSession; to: PlannedOccurrence }>;
  /** Future, SOLD: left where they are, and named so nobody is surprised. */
  protected: ExistingSession[];
  /** Future, unsold, no longer produced: cancel (never delete). */
  removed: ExistingSession[];
  /** Occurrences the new shape produces that do not exist yet. */
  added: PlannedOccurrence[];
};

const EMPTY_PLAN: SeriesEditPlan = {
  untouched: [],
  rescheduled: [],
  protected: [],
  removed: [],
  added: [],
};

/**
 * What an edit would do, given the occurrences the NEW shape produces and the
 * ones already stored.
 *
 * `now` splits past from future. An occurrence exactly at `now` counts as
 * future: a class starting this second has not happened yet, and treating it as
 * past would quietly exclude it from an edit the operator expects to include.
 *
 * `scope` of `"this_one"` restricts every bucket to the single occurrence named
 * by `onlyStartsAt`. It is not a different algorithm — the same rules apply to
 * a set of one, which is what stops "this one" and "all future" from drifting
 * apart as two code paths.
 */
export function planSeriesEdit(
  produced: ReadonlyArray<PlannedOccurrence>,
  stored: ReadonlyArray<ExistingSession>,
  scope: SeriesEditScope,
  now: Date = new Date(),
  onlyStartsAt?: string,
): SeriesEditPlan {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return EMPTY_PLAN;

  if (scope === "this_one" && !onlyStartsAt) {
    // Refusing rather than silently widening to every occurrence. A "this one"
    // edit that quietly became "all future" would rewrite a schedule the
    // operator did not agree to change.
    return EMPTY_PLAN;
  }
  const onlyMs = onlyStartsAt ? Date.parse(onlyStartsAt) : null;
  if (scope === "this_one" && (onlyMs == null || !Number.isFinite(onlyMs))) {
    return EMPTY_PLAN;
  }

  const inScope = (ms: number): boolean =>
    scope === "all_future" ? true : ms === onlyMs;

  const plan: SeriesEditPlan = {
    untouched: [],
    rescheduled: [],
    protected: [],
    removed: [],
    added: [],
  };

  // Instants the new shape produces, and which are still unclaimed as we match.
  const producedByInstant = new Map<number, PlannedOccurrence>();
  for (const occ of produced) {
    const at = Date.parse(occ.startsAt);
    if (Number.isFinite(at) && !producedByInstant.has(at)) producedByInstant.set(at, occ);
  }

  // Stored occurrences that already sit on a produced instant need no move.
  const matched = new Set<number>();
  const movable: ExistingSession[] = [];

  for (const row of stored) {
    const at = Date.parse(row.startsAt);
    if (!Number.isFinite(at)) continue;
    // A cancelled occurrence is already out of the schedule; re-cancelling or
    // moving it is noise, and reviving one by accident is worse.
    if (row.status === "cancelled") continue;

    if (at < nowMs) {
      plan.untouched.push(row);
      continue;
    }
    if (!inScope(at)) {
      plan.untouched.push(row);
      continue;
    }
    if (producedByInstant.has(at)) {
      // Already where the new shape wants it. Not a move, not an add.
      matched.add(at);
      continue;
    }
    if (row.hasAdmissions) {
      plan.protected.push(row);
      continue;
    }
    movable.push(row);
  }

  // Instants the new shape wants and nothing already occupies, in order, so a
  // moved occurrence lands on the nearest unclaimed slot rather than an
  // arbitrary one. Stable ordering matters: the preview the operator approved
  // must be the plan that runs.
  //
  // NOT filtered by `inScope`. The scope selects which EXISTING occurrence an
  // edit touches; it says nothing about where that occurrence may move TO. An
  // earlier version applied it to both, so "move this one from 17:00 to 18:00"
  // found no destination — the new instant was out of scope by definition,
  // because the scope was the old one. Caught by its own test, which is the
  // right way round: the fixture was right and the code was wrong.
  const freeInstants = [...producedByInstant.entries()]
    .filter(([at]) => !matched.has(at) && at >= nowMs)
    .sort((a, b) => a[0] - b[0]);

  movable.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  let cursor = 0;
  for (const row of movable) {
    const slot = freeInstants[cursor];
    if (!slot) {
      // The new shape produces fewer occurrences than exist. Nobody holds this
      // one, so it is cancelled rather than left dangling on a schedule the
      // series no longer describes.
      plan.removed.push(row);
      continue;
    }
    plan.rescheduled.push({ session: row, to: slot[1] });
    matched.add(slot[0]);
    cursor += 1;
  }

  // Leftover produced instants are additions only when the whole series is
  // being reshaped. Editing ONE occurrence must never conjure new ones: an
  // operator moving next Tuesday is not asking for a fuller schedule.
  if (scope === "all_future") {
    for (const [at, occ] of freeInstants.slice(cursor)) {
      if (!matched.has(at)) plan.added.push(occ);
    }
  }

  return plan;
}

/**
 * Does this plan move or cancel anything somebody might notice?
 *
 * The editor uses it to decide whether to ask for confirmation. An edit that
 * only ADDS occurrences needs no warning; one that moves or cancels does, and
 * the difference is worth naming rather than warning every time — a
 * confirmation people see on every save is one they stop reading.
 */
export function planNeedsConfirmation(plan: SeriesEditPlan): boolean {
  return plan.rescheduled.length > 0 || plan.removed.length > 0 || plan.protected.length > 0;
}
