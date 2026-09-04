/**
 * lineup.ts — who is performing, and where that fact is allowed to appear.
 *
 * Pure: no Supabase import, so it gates in CI.
 *
 * A lineup entry is an INQUIRY with `event_id` set: the venue is the client,
 * the performer is the talent, and the fee is a talent-lane order. The ticket
 * money is a different order entirely and the two are never netted.
 *
 * THE HARD PART IS NOT DISPLAY, IT IS DISCLOSURE. The same row renders in three
 * places with three different audiences:
 *
 *   the venue's own Lineup tab   staff, sees everything including money
 *   the public event page        anyone, sees confirmed performers only
 *   the performer's own page     anyone, and it is the PERFORMER'S surface
 *
 * Getting that wrong does not look like a bug. It looks like a venue announcing
 * an act that has not agreed yet, which is a real harm to a real person's
 * negotiating position and reputation, and it is unrecoverable once indexed.
 */

/**
 * THE LINEUP'S OWN AXIS. Derived, never read off a column.
 *
 * This looked like a spine vocabulary and is not one. There are TWO enums and
 * this type belongs to neither:
 *
 *   inquiry_participant_status : invited, active, declined, removed
 *   inquiry_status             : new ... offer_pending, approved, booked, ...
 *
 * `invited` is a PARTICIPANT'S status on `inquiry_participants`. `booked` is
 * the INQUIRY'S status on `inquiries`. My first version put both in one field
 * and sorted them against each other, which has no defined answer for the most
 * common row a venue will have: **a performer who is `invited` as a participant
 * on an inquiry whose status is `booked`** -- the DJ you invited, on the booking
 * you closed. Each word was individually correct and the comparison between them
 * was meaningless.
 *
 * So the lineup declares its own axis and states the derivation. `resolveLineupState`
 * is the only place the two enums meet.
 */
export type LineupState = "invited" | "negotiating" | "booked" | "declined" | "cancelled";

/** The spine values this derives from. Strings, not enums, so this stays pure. */
export type SpineStatuses = {
  /** `inquiry_participants.status` for this performer, if they are a participant. */
  participantStatus?: string | null;
  /** `inquiries.status` for the inquiry carrying `event_id`. */
  inquiryStatus?: string | null;
};

/**
 * Collapse the two spine vocabularies into the one axis a lineup panel needs.
 *
 * THE INQUIRY WINS WHERE IT IS DECISIVE, because it is the fact about the
 * ENGAGEMENT, while the participant status is a fact about a PERSON'S place in
 * a conversation. A closed booking with a still-`invited` participant row is
 * booked: the deal is done and the participant row simply never moved.
 *
 * Anything not decisive falls back to the participant, and anything unknown is
 * `invited` rather than `booked` -- the safe direction, because `booked` is the
 * only value that publishes.
 */
export function resolveLineupState(s: SpineStatuses): LineupState {
  const inquiry = s.inquiryStatus ?? null;
  const participant = s.participantStatus ?? null;

  // Terminal on the engagement, whatever the participant row says.
  if (inquiry === "booked" || inquiry === "converted") return "booked";
  if (inquiry === "rejected" || inquiry === "closed_lost") return "declined";
  if (inquiry === "expired" || inquiry === "archived" || inquiry === "closed") return "cancelled";

  // Terminal on the person.
  if (participant === "declined") return "declined";
  if (participant === "removed") return "cancelled";

  // A live negotiation: an offer is out, or the participant has engaged.
  if (inquiry === "offer_pending" || inquiry === "approved") return "negotiating";
  if (participant === "active") return "negotiating";

  // Unknown resolves to `invited`, never `booked`. `booked` is the only value
  // that publishes a performer's name, and guessing it wrong announces someone
  // who has not agreed.
  return "invited";
}

export type LineupEntry = {
  inquiryId: string;
  talentProfileId: string | null;
  /** For an act with no Tulala profile, added by hand. */
  displayName: string;
  state: LineupState;
  role?: string | null;
  setStartsAt?: string | null;
  setEndsAt?: string | null;
  sortOrder: number;
};

export type EventForLineup = {
  id: string;
  status: "draft" | "published" | "cancelled";
  startsAt: string | null;
  /** The venue's choice: hide set times until the day if the running order may change. */
  setTimesPublic: boolean;
};

/**
 * ONLY a confirmed booking is public, and this is the load-bearing rule.
 *
 * `invited` and `negotiating` are NOT AGREEMENTS. Publishing them announces an act that
 * has not agreed, which damages the performer's leverage on the fee still being
 * discussed and their reputation if it falls through. `declined` and `cancelled`
 * are self-evidently private.
 *
 * A draft or cancelled event publishes nobody, whatever the bookings say.
 */
export function isPubliclyVisible(entry: LineupEntry, event: EventForLineup): boolean {
  if (event.status !== "published") return false;
  return entry.state === "booked";
}

/**
 * The lineup as the public sees it: confirmed acts, in running order, with set
 * times only when the venue has said they are stable.
 *
 * Set times are stripped rather than the entry being hidden. A venue that has
 * not fixed the running order still wants the acts announced -- that is the
 * poster -- and an entry with a wrong time is worse than one with no time,
 * because people plan an evening around it.
 */
export function publicLineup(
  entries: readonly LineupEntry[],
  event: EventForLineup,
): LineupEntry[] {
  return entries
    .filter((e) => isPubliclyVisible(e, event))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName))
    .map((e) =>
      event.setTimesPublic ? e : { ...e, setStartsAt: null, setEndsAt: null },
    );
}

export type CrossListing =
  | { listed: true; upcoming: boolean }
  | { listed: false; reason: "not_public" | "no_profile" | "event_over" | "no_date" };

/**
 * Whether this event appears on the PERFORMER'S own public page.
 *
 * Stricter than the event page, and deliberately so. The event page is the
 * venue's surface and the venue chose to announce; the performer's page is
 * SOMEBODY ELSE'S, and putting a show on it is a claim about them made by a
 * third party. So it needs a confirmed booking, a published event, and an
 * actual profile to attach to.
 *
 * `no_profile` is an off-platform act typed in by hand -- a real and common
 * case, and there is nowhere to cross-list it, which is a refusal rather than
 * a failure.
 */
export function crossListing(
  entry: LineupEntry,
  event: EventForLineup,
  now: string | Date,
): CrossListing {
  if (!isPubliclyVisible(entry, event)) return { listed: false, reason: "not_public" };
  if (!entry.talentProfileId) return { listed: false, reason: "no_profile" };

  if (!event.startsAt) return { listed: false, reason: "no_date" };
  const start = Date.parse(event.startsAt);
  const t = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(t)) {
    return { listed: false, reason: "no_date" };
  }

  // A past show still belongs on a performer's page as history -- it is the
  // evidence they work -- but it is not "upcoming" and must not sit in a
  // "coming up" rail forever.
  return { listed: true, upcoming: start > t };
}

/**
 * The staff view: everyone, negotiations included, ordered so the ones needing
 * a human come first.
 *
 * `invited` outranks `negotiating` because an invitation with no reply is the entry
 * most likely to be forgotten, and a show with an unfilled slot two days out is
 * the failure this tab exists to prevent.
 */
const STAFF_PRIORITY: Record<LineupState, number> = {
  invited: 0,
  negotiating: 1,
  booked: 2,
  declined: 3,
  cancelled: 4,
};

export function staffLineup(entries: readonly LineupEntry[]): LineupEntry[] {
  return [...entries].sort(
    (a, b) =>
      STAFF_PRIORITY[a.state] - STAFF_PRIORITY[b.state] ||
      a.sortOrder - b.sortOrder ||
      a.displayName.localeCompare(b.displayName),
  );
}

/** Slots still needing a human before the doors open. */
export function openSlots(entries: readonly LineupEntry[]): number {
  return entries.filter((e) => e.state === "invited" || e.state === "negotiating").length;
}
