/**
 * event-policy.ts — the pure decisions an event makes.
 *
 * No Supabase import, so it gates in CI rather than needing a database.
 *
 * Three things live here, and each exists because the alternative is a value
 * that looks like an answer:
 *
 *   - the slug, which must survive a rename of the title
 *   - the status transitions, which are a small set with real illegal moves
 *   - the refund decision, which returns a REASON and never a bare boolean
 *
 * Doors is deliberately trivial and deliberately here rather than in a
 * scheduling module: it is subtraction against an instant. See `doorsAt`.
 */

export type EventStatus = "draft" | "published" | "cancelled";

export type AdmissionKind = "ticket" | "pass" | "registration" | "rsvp";

/** Slugs are lowercase, hyphenated, ASCII, and never empty. */
export function toEventSlug(title: string): string | null {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : null;
}

/**
 * Legal status moves.
 *
 * `cancelled` is TERMINAL. Un-cancelling a show whose orders have been refunded
 * and whose buyers have been emailed is not a state change, it is a new event,
 * and modelling it as a transition would let one click re-open sales on seats
 * that have already been given back.
 */
const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["draft", "cancelled"],
  cancelled: [],
};

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * When doors open for one occurrence.
 *
 * `startsAt` is already a resolved instant, so this is subtraction and NO
 * timezone is involved. Resist the pull to route it through a zone resolver:
 * this platform shipped two of those with opposite DST policies, and the reason
 * doors is an offset rather than a wall clock is precisely so it cannot acquire
 * a second one.
 *
 * Returns null rather than a guess when the input is unusable.
 */
export function doorsAt(startsAt: string | Date, offsetMinutes: number): Date | null {
  const start = startsAt instanceof Date ? startsAt.getTime() : Date.parse(startsAt);
  if (!Number.isFinite(start)) return null;
  if (!Number.isFinite(offsetMinutes) || offsetMinutes < 0) return null;
  return new Date(start - Math.round(offsetMinutes) * 60_000);
}

/**
 * The refund decision, as a discriminated union.
 *
 * It returns WHY, not just whether. A bare boolean here becomes "no refund" on
 * the one path where the policy is simply unknown, and a customer is told the
 * cutoff has passed when in truth nobody has set one -- the shape this repo
 * records as "a function that answers instead of refusing".
 *
 * `cutoffHours` of null means the event inherits, so the caller must resolve the
 * workspace default BEFORE asking. That is why `unknown_policy` exists: it is
 * unreachable if the caller did its job, and loud if it did not.
 */
export type RefundDecision =
  | { refundable: true; reason: "within_window" }
  | { refundable: true; reason: "event_cancelled" }
  | { refundable: false; reason: "cutoff_passed"; cutoffAt: Date }
  | { refundable: false; reason: "unknown_policy" }
  | { refundable: false; reason: "bad_input" };

export function refundDecision(args: {
  sessionStartsAt: string | Date;
  now: string | Date;
  cutoffHours: number | null;
  eventCancelled?: boolean;
}): RefundDecision {
  // A cancelled show refunds regardless of the cutoff. The cutoff protects a
  // venue against a late change of mind by the BUYER; it was never meant to let
  // a venue keep the money for a night it decided not to hold.
  if (args.eventCancelled === true) return { refundable: true, reason: "event_cancelled" };

  if (args.cutoffHours === null || args.cutoffHours === undefined) {
    return { refundable: false, reason: "unknown_policy" };
  }
  if (!Number.isFinite(args.cutoffHours) || args.cutoffHours < 0) {
    return { refundable: false, reason: "bad_input" };
  }

  const start =
    args.sessionStartsAt instanceof Date
      ? args.sessionStartsAt.getTime()
      : Date.parse(args.sessionStartsAt);
  const now = args.now instanceof Date ? args.now.getTime() : Date.parse(args.now);
  if (!Number.isFinite(start) || !Number.isFinite(now)) {
    return { refundable: false, reason: "bad_input" };
  }

  const cutoff = start - args.cutoffHours * 3_600_000;
  // Strictly before the cutoff refunds. Exactly ON the cutoff does not: a policy
  // reading "full until 48h before" is a promise about the window, and the
  // instant the window closes is outside it.
  if (now < cutoff) return { refundable: true, reason: "within_window" };
  return { refundable: false, reason: "cutoff_passed", cutoffAt: new Date(cutoff) };
}

/**
 * May this event be hard-deleted?
 *
 * The ratified rule: only a draft with zero admissions. Everything else is a
 * cancellation, which preserves the sessions people bought. This is enforced
 * here rather than by a BEFORE DELETE trigger because `events.tenant_id`
 * cascades from `agencies`, so a trigger would also fire on every row of a
 * tenant being deleted and block tenant deletion -- a guard firing where it was
 * never aimed.
 */
export function canHardDelete(args: {
  status: EventStatus;
  admissionCount: number;
}): { ok: true } | { ok: false; reason: "not_draft" | "has_admissions" } {
  if (args.status !== "draft") return { ok: false, reason: "not_draft" };
  if (args.admissionCount > 0) return { ok: false, reason: "has_admissions" };
  return { ok: true };
}
