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

export function shouldReAlert(input: {
  /** When the ticket was escalated to a human. */
  escalatedAt: string | Date;
  /** How many re-alerts have already been sent for this ticket. */
  priorReAlertCount: number;
  nowMs?: number;
}): boolean {
  const { priorReAlertCount } = input;
  if (priorReAlertCount >= MAX_RE_ALERTS) return false;
  if (priorReAlertCount < 0) return false;

  const escalatedMs =
    input.escalatedAt instanceof Date
      ? input.escalatedAt.getTime()
      : Date.parse(input.escalatedAt);
  if (!Number.isFinite(escalatedMs)) return false;

  const now = input.nowMs ?? Date.now();
  const dueAfterHours = RE_ALERT_SCHEDULE_HOURS[priorReAlertCount];
  return now - escalatedMs >= dueAfterHours * 3_600_000;
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
