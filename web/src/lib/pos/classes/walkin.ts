/**
 * walkin.ts — somebody is standing at the desk and wants an appointment now.
 *
 * TWO READS AND ONE WRITE, ALL BORROWED.
 *
 *   - Which services can be booked from the till: the workspace's published,
 *     TIMED offerings that name a person (`talent_profile_id`), which is the
 *     same shape the public `/book` page books. Products and untimed items
 *     belong to the Counter.
 *   - Which times are free today: `parseBookingHours` + `loadBusyIntervals` +
 *     `computePublicSlots`, the exact composition
 *     `/api/public/booking/slots` serves the website, over the same window
 *     shape (from now, one day). A second slot generator here would offer a
 *     walk-in a time the website would refuse.
 *   - The booking itself: `placeInstantPurchase`, the composition the public
 *     page's action runs (room, companions, stock pool, person's slot), with
 *     `payInPerson: true` so the order is held as `pending_payment` and the
 *     money is then taken through the Counter's own `startCollection`. A
 *     $0 service settles on creation and there is nothing to collect.
 *
 * WHY PAY IN PERSON AND NOT "FULL". The till has cash and a payment link; it
 * has no card reader (`pos/actions.ts` accepts `cash | online_card`). An
 * offering that forbids pay-in-person wants its money BEFORE the time is held,
 * and the pipeline enforces that itself (`pay_in_person_not_allowed`). That
 * refusal reaches the operator as a sentence; the till does not work around a
 * policy the owner set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PurchaseRefusalReason } from "@/lib/orders/purchase-types";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { placeInstantPurchase } from "@/lib/scheduling/instant-purchase";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import { computePublicSlots, type NoSlotsReason } from "@/lib/scheduling/public-slots";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";
import { logServerError } from "@/lib/server/safe-error";

export type WalkInService = {
  readonly offeringId: string;
  readonly title: string;
  readonly amountCents: number;
  readonly durationMinutes: number;
  readonly talentProfileId: string;
  readonly personName: string;
  readonly allowPayInPerson: boolean;
};

export type WalkInServicesResult =
  | { ok: true; services: WalkInService[] }
  | { ok: false; error: string };

/** The services a walk-in can be booked onto from this till. */
export async function loadWalkInServices(
  admin: SupabaseClient,
  tenantId: string,
): Promise<WalkInServicesResult> {
  const read = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, duration_minutes, talent_profile_id, allow_pay_in_person, kind, booking_mode")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .eq("booking_mode", "instant")
    .not("talent_profile_id", "is", null)
    .gt("duration_minutes", 0)
    .order("title", { ascending: true })
    .limit(60);
  if (read.error) {
    logServerError("pos.classes.walkin/services", read.error);
    return { ok: false, error: "Could not load the services." };
  }
  const rows = (read.data ?? []).filter((r) => r.kind !== "product");
  const talentIds = [...new Set(rows.map((r) => r.talent_profile_id).filter((id): id is string => typeof id === "string"))];
  const names = new Map<string, string>();
  if (talentIds.length > 0) {
    const people = await admin.from("talent_profiles").select("id, display_name, first_name").in("id", talentIds);
    if (people.error) {
      logServerError("pos.classes.walkin/people", people.error);
      return { ok: false, error: "Could not load the services." };
    }
    for (const p of people.data ?? []) {
      const name = (typeof p.display_name === "string" && p.display_name.trim()) || (typeof p.first_name === "string" && p.first_name.trim()) || "";
      if (name) names.set(String(p.id), name);
    }
  }
  const services: WalkInService[] = [];
  for (const r of rows) {
    if (typeof r.talent_profile_id !== "string" || typeof r.duration_minutes !== "number") continue;
    services.push({
      offeringId: String(r.id),
      title: (typeof r.title === "string" && r.title.trim()) || String(r.id).slice(0, 8),
      amountCents: typeof r.amount_cents === "number" ? r.amount_cents : Number(r.amount_cents ?? 0) || 0,
      durationMinutes: r.duration_minutes,
      talentProfileId: r.talent_profile_id,
      personName: names.get(r.talent_profile_id) ?? "",
      allowPayInPerson: r.allow_pay_in_person === true,
    });
  }
  return { ok: true, services };
}

export type WalkInSlotsResult =
  | { ok: true; starts: string[]; timeZone: string; reason: NoSlotsReason | null }
  | { ok: false; reason: "not_found" | "no_booking_hours" | "hours_unreadable" | "unavailable" };

/**
 * Free starts for one service on the day being viewed, from now on.
 *
 * `from` is never before now: a walk-in cannot be booked into a time that has
 * passed, and `public-slots.ts` records why the public page floors it too.
 */
export async function loadWalkInSlots(
  admin: SupabaseClient,
  input: { tenantId: string; offeringId: string; now: Date; timeZone: string; dayOffset: number },
): Promise<WalkInSlotsResult> {
  const offering = await admin
    .from("talent_offerings")
    .select("id, talent_profile_id, duration_minutes, status")
    .eq("id", input.offeringId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (offering.error) {
    logServerError("pos.classes.walkin/offering", offering.error);
    return { ok: false, reason: "unavailable" };
  }
  const row = offering.data;
  if (!row || row.status !== "published" || typeof row.talent_profile_id !== "string") {
    return { ok: false, reason: "not_found" };
  }
  const hoursRow = await admin
    .from("talent_booking_hours")
    .select("timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days")
    .eq("talent_profile_id", row.talent_profile_id)
    .maybeSingle();
  if (hoursRow.error) {
    logServerError("pos.classes.walkin/hours", hoursRow.error);
    return { ok: false, reason: "unavailable" };
  }
  const hours = parseBookingHours(hoursRow.data);
  if (!hours) return { ok: false, reason: hoursRow.data ? "hours_unreadable" : "no_booking_hours" };

  // The day on the venue's calendar; the person's own zone decides their
  // hours, exactly as the public endpoint lets it.
  const todayYmd = utcToZonedYmd(input.now, input.timeZone) ?? input.now.toISOString().slice(0, 10);
  const dayYmd = addUtcDays(todayYmd, input.dayOffset) ?? todayYmd;
  const dayStart = new Date(`${dayYmd}T00:00:00.000Z`);
  const from = input.dayOffset <= 0 || dayStart.getTime() < input.now.getTime() ? input.now : dayStart;
  const windowEnd = new Date(`${addUtcDays(dayYmd, 1) ?? dayYmd}T23:59:59.999Z`);

  const busy = await loadBusyIntervals({
    admin,
    talentProfileId: row.talent_profile_id,
    from,
    to: windowEnd,
    now: input.now,
  });
  const { starts, reason } = computePublicSlots({
    hours,
    durationMinutes:
      typeof row.duration_minutes === "number" && row.duration_minutes > 0 ? row.duration_minutes : hours.slotMinutes,
    from,
    // Two civil days, then narrowed to the venue day below: the generator
    // walks UTC days, and a venue evening west of Greenwich is tomorrow in
    // UTC. One UTC day would drop the 8 pm slots of a Mexico City salon.
    days: 2,
    busy,
  });
  // The day the operator is looking at, on the venue's calendar, and no other.
  const onDay = starts.filter((iso) => utcToZonedYmd(new Date(iso), input.timeZone) === dayYmd);
  return { ok: true, starts: onDay, timeZone: hours.timezone, reason: onDay.length === 0 ? (reason ?? "closed_in_window") : null };
}

export type WalkInBookingRefusal =
  | PurchaseRefusalReason
  | "invalid"
  | "not_found";

export type WalkInBookingResult =
  | {
      ok: true;
      orderId: string;
      bookingId: string | null;
      /** What the till still has to take. 0 for a free service. */
      collectCents: number;
    }
  | { ok: false; reason: WalkInBookingRefusal };

/**
 * Book the slot. The slot is held by the pipeline under the person's
 * calendar lock; a taken time comes back as `slot_taken`, a full room as
 * `sold_out`, and a policy the till cannot honour as its own reason.
 */
export async function bookWalkInAppointment(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    offeringId: string;
    startsAt: string;
    customer: { name: string; email: string | null; phone: string | null };
    actorUserId: string;
    /** Names THIS attempt so a double tap cannot book twice. */
    clientOrderKey: string;
  },
): Promise<WalkInBookingResult> {
  const name = input.customer.name.trim();
  if (!name) return { ok: false, reason: "invalid" };
  const startMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startMs)) return { ok: false, reason: "invalid" };

  const offering = await admin
    .from("talent_offerings")
    .select("id, talent_profile_id, duration_minutes, status, amount_cents")
    .eq("id", input.offeringId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (offering.error) {
    logServerError("pos.classes.walkin/book-offering", offering.error);
    return { ok: false, reason: "engine_error" };
  }
  const row = offering.data;
  if (!row || row.status !== "published" || typeof row.talent_profile_id !== "string" || typeof row.duration_minutes !== "number" || row.duration_minutes <= 0) {
    return { ok: false, reason: "not_found" };
  }
  const endsAt = new Date(startMs + row.duration_minutes * 60_000).toISOString();

  // `ensureCustomer` (inside the pipeline) keys a customer on email or phone.
  // A walk-in with neither is still a person with a name: the pipeline takes
  // an anonymous buyer and the name rides on the booking's contact fields.
  const email = input.customer.email?.trim() || null;
  const phone = input.customer.phone?.trim() || null;
  const free = Number(row.amount_cents ?? 0) <= 0;

  const placed = await placeInstantPurchase(admin, {
    tenantId: input.tenantId,
    offeringId: String(row.id),
    talentProfileId: row.talent_profile_id,
    actorUserId: null,
    contact: { email, phone, displayName: name },
    quantity: 1,
    variantId: null,
    addOnIds: [],
    reservation: { startsAt: new Date(startMs).toISOString(), endsAt },
    // A free service settles on creation ("full" of nothing); a priced one is
    // held for the till to collect. The pipeline refuses the second when the
    // offering forbids it.
    payInPerson: free ? undefined : true,
    sourceChannel: "pos",
    sourcePage: "pos-classes",
    clientOrderKey: input.clientOrderKey,
    openThread: false,
  });
  if (!placed.ok) return { ok: false, reason: placed.reason };
  return {
    ok: true,
    orderId: placed.orderId,
    bookingId: placed.bookingId ?? null,
    collectCents: placed.payInPerson ? placed.totalCents : placed.collectCents,
  };
}
