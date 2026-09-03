/**
 * types.ts — the shapes Reservations reads.
 *
 * PURE. No Supabase import anywhere in this directory's decision layer, so it
 * runs in every test lane.
 */

/** ISO weekday, 1 = Monday … 7 = Sunday, matching Postgres `isodow`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * How to resolve a wall clock that does not exist, because the zone skipped it.
 *
 * There is no safe default, which is why this is never optional. A service
 * window needs BOTH policies in one feature:
 *
 *   "next"  the instant the clock actually reaches. Correct for a window's own
 *           boundaries: if dinner's start lands in the gap, refusing closes a
 *           restaurant whose doors are open.
 *   "skip"  refuse. Correct for a seating offered to a guest: 02:30 moved to
 *           03:30 lands on the real 03:30 seating, and the page then offers one
 *           instant twice under two labels.
 *
 * Two resolvers live on main with opposite hard-coded policies
 * (`scheduling/tz.ts` refuses, `sessions/recurrence.ts` takes the later
 * candidate), so inheriting one by import is a coin flip nobody knows they are
 * tossing.
 */
export type GapPolicy = "skip" | "next";

/** A recurring service window: a wall clock plus a length, never a pair of minutes in a day. */
export type ServiceWindow = {
  id: string;
  venueId: string;
  key: string;
  /** Minutes past local midnight. */
  localTimeMin: number;
  durationMinutes: number;
  weekdays: IsoWeekday[];
  /** Minutes after the start. `null` = the window's end minus this party's turn. */
  lastSeatingOffsetMin: number | null;
  seatingStepMinutes: number;
  turnMinutesOverride: number | null;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
};

/** One varied date. A closure or an override, never both (enforced in the schema too). */
export type ServiceWindowException = {
  venueId: string;
  /** `null` = the whole venue, so one row shuts every window that day. */
  windowId: string | null;
  onDate: string;
  isClosed: boolean;
  localTimeMin: number | null;
  durationMinutes: number | null;
  lastSeatingOffsetMin: number | null;
};

/** Turn time for a party-size band. */
export type TurnTimeBand = {
  minParty: number;
  maxParty: number;
  turnMinutes: number;
};

export type ServiceRules = {
  venueId: string;
  isActive: boolean;
  partySizeMin: number;
  partySizeMax: number;
  horizonDays: number;
  minNoticeMinutes: number;
  turnTimeBands: TurnTimeBand[];
  defaultTurnMinutes: number;
  allowPublicUpsize: boolean;
  /** `null` = never ask. Not 0, and not a large sentinel. */
  cardOnFileFromParty: number | null;
  noShowFeeCents: number;
  noShowFeeBasis: "per_person" | "per_party";
  noShowGraceMinutes: number;
  depositFromParty: number | null;
  depositCentsPerPerson: number;
  freeCancelHours: number;
  waitlistEnabled: boolean;
  walkinsEnabled: boolean;
  notesEnabled: boolean;
};

/** A window resolved onto one calendar date, as instants. */
export type ResolvedWindow = {
  windowId: string;
  key: string;
  /** The date in the venue's zone that this window belongs to. */
  onDate: string;
  startsAt: Date;
  endsAt: Date;
  /** Last moment a party may be seated, as an instant. */
  lastSeatingAt: Date;
  seatingStepMinutes: number;
  turnMinutesOverride: number | null;
};

/**
 * Why a date produced no window. Named rather than returned as an empty array,
 * because "closed today" and "this venue has no dinner service" are different
 * answers and a caller shows different words for them.
 */
export type WindowRefusal =
  | "not_on_this_weekday"
  | "outside_series_dates"
  | "inactive"
  | "closed_by_exception"
  | "unknown_timezone"
  | "start_does_not_exist";

export type WindowResolution =
  | { ok: true; window: ResolvedWindow }
  | { ok: false; reason: WindowRefusal };

/** A seating time a guest may actually be offered. */
export type SeatingOption = {
  startsAt: Date;
  endsAt: Date;
  /** Local wall clock, "HH:MM", for display. */
  localLabel: string;
  isLastSeating: boolean;
};
