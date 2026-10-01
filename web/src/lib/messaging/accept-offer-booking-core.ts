/**
 * Accept -> the real booking behind the order. Orchestration only, no I/O.
 *
 * WHY THIS EXISTS (P0, Jor, 2026-10-01). A guest accept used to create the
 * order and the pay link and nothing else. When the guest opened checkout,
 * `bookingShellForOrder` found no booking for the order and minted the POS
 * shell: `agency_bookings` row "POS sale", status `confirmed`, no time, no
 * service, no `booking_talent` leg. The talent's cancel authorizes by that leg
 * (`requireOwnBooking`), so it refused "unauthorized" and the order and its
 * pay link stayed open and payable.
 *
 * Now the accept writes the booking the agenda writes (create-slot.ts shape):
 * `agency_bookings` linked to the order (`order_id`, so the checkout shell
 * lookup finds THIS row and never mints a second), a `booking_talent` leg for
 * the offer's talent, the order lines pointed at the booking, and, when a
 * time was agreed, the `talent_bookings` mirror sharing the booking id.
 *
 * Booking state is about the TIME, never the money:
 *   - a time was agreed (reservation stamp or a live firm hold) -> `confirmed`
 *     with that window, mirrored on the talent calendar;
 *   - no time agreed, or the time is no longer free -> `draft` (the existing
 *     `booking_status` value that is not a confirmation). It carries no
 *     window, and the talent sets one.
 * Paid or not changes neither.
 */

export type OfferBookingWindow = {
  talentProfileId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  holdId: string | null;
};

export type OfferBookingStatus = "confirmed" | "draft";

export type OfferBookingPlan = {
  status: OfferBookingStatus;
  scheduled: boolean;
  window: OfferBookingWindow | null;
};

/** PURE: a booking is confirmed only when it has a real window. */
export function planOfferBooking(window: OfferBookingWindow | null): OfferBookingPlan {
  if (!window) return { status: "draft", scheduled: false, window: null };
  const s = Date.parse(window.startsAt);
  const e = Date.parse(window.endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { status: "draft", scheduled: false, window: null };
  return { status: "confirmed", scheduled: true, window };
}

export type OfferBookingStore = {
  /** The talent the offer is for: line talent, else offering talent, else the sender's own profile. */
  resolveTalent(): Promise<string | null>;
  /** The agreed window, if any (reservation stamp, else a live firm hold). */
  resolveWindow(): Promise<{ ok: true; window: OfferBookingWindow | null } | { ok: false }>;
  /** The booking already behind this order (or, with no order, this inquiry's accept). */
  findBooking(orderId: string | null): Promise<{ ok: true; bookingId: string | null; scheduled: boolean } | { ok: false }>;
  insertBooking(input: { orderId: string | null; plan: OfferBookingPlan }): Promise<{ ok: true; bookingId: string } | { ok: false; raced: boolean }>;
  /** Idempotent: inserts the leg only when the talent has none on this booking. */
  ensureTalentLeg(input: { bookingId: string; talentProfileId: string }): Promise<boolean>;
  /** The calendar mirror (id = booking id). "taken" = the window is no longer free. */
  insertMirror(input: { bookingId: string; talentProfileId: string; window: OfferBookingWindow }): Promise<"ok" | "taken" | "failed">;
  /** The time was not free after all: the booking stays, unconfirmed and without a window. */
  markUnscheduled(bookingId: string): Promise<void>;
  releaseHolds(holdId: string | null): Promise<void>;
  linkOrderLines(input: { orderId: string; bookingId: string }): Promise<void>;
  removeBooking(bookingId: string): Promise<void>;
};

export type OfferBookingResult =
  | { ok: true; bookingId: string; scheduled: boolean; talentProfileId: string; created: boolean }
  | { ok: false; reason: "no_talent" | "unavailable" };

export async function ensureOfferBooking(store: OfferBookingStore, input: { orderId: string | null }): Promise<OfferBookingResult> {
  const talentProfileId = await store.resolveTalent();
  if (!talentProfileId) return { ok: false, reason: "no_talent" };

  const found = await store.findBooking(input.orderId);
  if (!found.ok) return { ok: false, reason: "unavailable" };
  if (found.bookingId) {
    // A retry, or a booking an earlier path made for this order: heal the
    // talent link (what cancel authorizes by) and the order lines, create nothing.
    if (!(await store.ensureTalentLeg({ bookingId: found.bookingId, talentProfileId }))) return { ok: false, reason: "unavailable" };
    if (input.orderId) await store.linkOrderLines({ orderId: input.orderId, bookingId: found.bookingId });
    return { ok: true, bookingId: found.bookingId, scheduled: found.scheduled, talentProfileId, created: false };
  }

  const resolved = await store.resolveWindow();
  // A window we cannot read is not an agreed time: book unscheduled rather than confirm blind.
  const rawWindow = resolved.ok ? resolved.window : null;
  // A window held for another talent does not defend this talent's calendar.
  const plan = planOfferBooking(rawWindow && rawWindow.talentProfileId === talentProfileId ? rawWindow : null);

  const inserted = await store.insertBooking({ orderId: input.orderId, plan });
  if (!inserted.ok) {
    if (!inserted.raced) return { ok: false, reason: "unavailable" };
    const winner = await store.findBooking(input.orderId);
    if (!winner.ok || !winner.bookingId) return { ok: false, reason: "unavailable" };
    if (!(await store.ensureTalentLeg({ bookingId: winner.bookingId, talentProfileId }))) return { ok: false, reason: "unavailable" };
    if (input.orderId) await store.linkOrderLines({ orderId: input.orderId, bookingId: winner.bookingId });
    return { ok: true, bookingId: winner.bookingId, scheduled: winner.scheduled, talentProfileId, created: false };
  }
  const bookingId = inserted.bookingId;

  if (!(await store.ensureTalentLeg({ bookingId, talentProfileId }))) {
    // A booking no talent can see or cancel is the defect itself: take it back.
    await store.removeBooking(bookingId);
    return { ok: false, reason: "unavailable" };
  }

  let scheduled = plan.scheduled;
  if (plan.scheduled && plan.window) {
    const mirrored = await store.insertMirror({ bookingId, talentProfileId, window: plan.window });
    if (mirrored === "ok") {
      await store.releaseHolds(plan.window.holdId);
    } else {
      // Taken (or unwritable): never leave a confirmed booking the calendar cannot see.
      await store.markUnscheduled(bookingId);
      scheduled = false;
    }
  }

  if (input.orderId) await store.linkOrderLines({ orderId: input.orderId, bookingId });
  return { ok: true, bookingId, scheduled, talentProfileId, created: true };
}

/**
 * PURE: the order's lines, from the offer's own lines when they add up to the
 * total the guest accepted; otherwise one line for the total (never a sum the
 * guest was not shown). Offer money is NUMERIC major units; orders are cents.
 */
export function orderLinesFromOffer(
  lines: ReadonlyArray<{ label: string | null; talent_profile_id: string | null; total_price: number | string | null }>,
  totalCents: number,
): Array<{ label: string; cents: number; talentProfileId: string | null }> {
  const mapped = lines.map((l) => ({
    label: ((l.label ?? "").trim() || "Booking").slice(0, 120),
    cents: Math.round(Number(l.total_price ?? 0) * 100),
    talentProfileId: l.talent_profile_id ?? null,
  }));
  const sum = mapped.reduce((a, l) => a + (Number.isFinite(l.cents) ? l.cents : NaN), 0);
  if (mapped.length > 0 && sum === totalCents && mapped.every((l) => l.cents >= 0)) return mapped;
  const first = mapped[0];
  return [{ label: first?.label ?? "Booking", cents: totalCents, talentProfileId: mapped.find((l) => l.talentProfileId)?.talentProfileId ?? null }];
}
