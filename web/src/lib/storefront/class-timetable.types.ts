/**
 * class_timetable — the types the island codes against.
 *
 * Day tabs with session cards and spots-left on a phone; a week grid on
 * desktop. The act books a seat, joins the waitlist when the class is full,
 * or accepts an offered place.
 */

import type { StorefrontRefusal } from "./refusals";

export type ClassTimetableProps = {
  /** Which series the block shows. `"all"` (default) = every scheduled class. */
  seriesIds?: string[] | "all";
  view?: "week" | "list";
  showSpots?: boolean;
  waitlist?: boolean;
  /** ISO instants bounding the window; default now → now + 30 days. */
  from?: string | null;
  to?: string | null;
  /**
   * The person's e-mail, when the island already knows it (a signed-in
   * customer, or one who joined a waitlist in this session). Lets the read
   * answer "your place" per session.
   */
  email?: string | null;
  locale?: string | null;
};

export type ClassSeries = {
  id: string;
  title: string;
  timezone: string | null;
};

export type ClassSession = {
  id: string;
  seriesId: string | null;
  offeringId: string;
  title: string;
  startsAtIso: string;
  endsAtIso: string;
  /** REQUIRED: a session whose zone cannot be resolved is not listed. */
  timezone: string;
  amountCents: number | null;
  currency: string;
  /** null = this session sells no seats of its own. Never rendered as "free". */
  seatsRemaining: number | null;
  seatsTotal: number | null;
  soldOut: boolean;
  /** Present when the class is full and the block allows a queue. */
  waitlist: {
    open: boolean;
    waiting: number;
    /** The person's own entry, when `props.email` matched one. */
    mine: {
      entryId: string;
      status: "waiting" | "offered" | "accepted" | "withdrawn" | "expired";
      offerExpiresAtIso: string | null;
    } | null;
  };
};

export type ClassTimetableData = {
  series: ClassSeries[];
  sessions: ClassSession[];
  /** The window the sessions were read for. */
  fromIso: string;
  toIso: string;
  prefill: { name: string | null; email: string | null } | null;
};

export type ClassTimetableInput =
  | {
      op: "book";
      tenantId: string;
      sessionId: string;
      units: number;
      contact: { name: string; email: string; phone?: string | null };
      /** INTENT; the offering's policy decides. */
      payment?: "full" | "in_person";
      /** Per CART, not per click. */
      clientOrderKey: string;
      locale?: string | null;
      sourcePage?: string | null;
    }
  | {
      op: "join_waitlist";
      tenantId: string;
      sessionId: string;
      contact: { name: string; email: string; phone?: string | null };
      locale?: string | null;
    }
  | {
      op: "accept_offer";
      tenantId: string;
      entryId: string;
      /** Must match the entry's e-mail; the id alone is not a capability. */
      email: string;
      locale?: string | null;
    };

export type ClassTimetableDone =
  | {
      ok: true;
      op: "book";
      orderId: string;
      collectCents: number;
      checkoutUrl: string | null;
      receiptCode: string | null;
      session: { id: string; title: string; startsAtIso: string; endsAtIso: string; timezone: string };
      replayed: boolean;
    }
  | { ok: true; op: "join_waitlist"; entryId: string; already: boolean }
  | { ok: true; op: "accept_offer"; entryId: string; already: boolean };

export type ClassTimetableResult = ClassTimetableDone | StorefrontRefusal;
