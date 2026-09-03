/**
 * When an unanswered escalation should nudge the owner again.
 *
 * The lifecycle cron used to re-alert on EVERY hourly run for any escalated
 * ticket with no human reply older than four hours, minting a fresh event row
 * each time. A fresh event id means a fresh dedupe key, so nothing suppressed
 * it: production sent 61 identical emails for one ticket, 61 for another and 21
 * for a third. Roughly one per hour, for days, until somebody replied.
 *
 * That is worse than sending nothing. A channel that repeats itself hourly
 * teaches the person receiving it to ignore the channel, and the next alert —
 * the real one — goes unread with it.
 *
 * The intent was right: a forgotten escalation should chase you. So this keeps
 * chasing, on a widening interval, and then stops.
 *
 * Hours after escalation: 4, 12, 24, 48, 96. Five nudges over four days, then
 * silence — by then the ticket's age is visible in the queue and another email
 * adds nothing. Widening rather than fixed, because urgency decays: the gap
 * between "you missed it" and "you are ignoring it" is worth one message, not
 * ninety.
 */
export const RE_ALERT_SCHEDULE_HOURS = [4, 12, 24, 48, 96] as const;

/** Total nudges an escalation can produce before it goes quiet. */
export const MAX_RE_ALERTS = RE_ALERT_SCHEDULE_HOURS.length;

/**
 * Gap before the NEXT nudge, measured from the last one rather than from the
 * escalation.
 *
 * The first version measured every threshold from `escalatedAt`, which is
 * correct for a ticket that escalates while the system is running and wrong for
 * one that is already old. A ticket escalated four days ago has passed all five
 * thresholds, so on the first cron run it is "due" for nudge 1, an hour later
 * for nudge 2, and so on: the whole allowance burns in five consecutive hours.
 * Five emails is not sixty-one, but it is still a burst, and a burst is the
 * shape of the failure we just fixed — arriving in a clump is most of what made
 * the original storm read as broken.
 *
 * Spacing from the previous nudge makes the cadence hold no matter how old the
 * ticket is when the rule starts applying. These are the gaps BETWEEN the
 * original 4/12/24/48/96 marks, so a ticket that escalates under the new code
 * gets exactly the same timeline as before.
 */
const RE_ALERT_GAP_HOURS = [4, 8, 12, 24, 48] as const;

export function shouldReAlert(input: {
  /** When the ticket was escalated to a human. */
  escalatedAt: string | Date;
  /** How many re-alerts have already been sent for this ticket. */
  priorReAlertCount: number;
  /**
   * When the most recent re-alert was sent, if any. Absent means none has been,
   * and the clock runs from the escalation.
   */
  lastReAlertAt?: string | Date | null;
  nowMs?: number;
}): boolean {
  const { priorReAlertCount } = input;
  if (priorReAlertCount >= MAX_RE_ALERTS) return false;
  if (priorReAlertCount < 0) return false;

  // With no prior nudge the clock starts at the escalation; after one, it
  // starts at that nudge. If a nudge is known to have been sent but its time is
  // missing, refuse rather than fall back to the escalation: the fallback would
  // treat an already-nudged old ticket as freshly due, which is the burst this
  // whole module exists to prevent. Both values come from the same rows, so in
  // practice one cannot be present without the other.
  if (priorReAlertCount > 0 && !input.lastReAlertAt) return false;
  const since = priorReAlertCount > 0 ? input.lastReAlertAt! : input.escalatedAt;
  const sinceMs = since instanceof Date ? since.getTime() : Date.parse(String(since));
  if (!Number.isFinite(sinceMs)) return false;

  const now = input.nowMs ?? Date.now();
  const gapHours = RE_ALERT_GAP_HOURS[priorReAlertCount];
  return now - sinceMs >= gapHours * 3_600_000;
}

/**
 * Human-readable "how long this has been waiting", for the alert itself.
 *
 * The old email said only that a ticket needed attention. How long it had been
 * sitting is the single fact that decides whether you open it now or later, and
 * it was the one fact missing.
 */
export function waitedLabel(escalatedAt: string | Date, nowMs = Date.now()): string {
  const ms =
    nowMs -
    (escalatedAt instanceof Date ? escalatedAt.getTime() : Date.parse(String(escalatedAt)));
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)} days`;
}
