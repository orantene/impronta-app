/**
 * Talent-owned slot booking create (T7.1 / G0.1 / Stage B1).
 * Busy-check, then agency_bookings + booking_talent + talent_bookings on the
 * platform hub (talent as seller). No agency roster required.
 */

"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import type { BusyInterval } from "@/lib/scheduling/slots";
import { loadTalentActor } from "@/lib/messaging/talent-actor";
import { computeBookingTalentRowTotals } from "@/lib/booking-pricing";
import { resolveTalentOwnWorkTenant } from "@/lib/talent-agenda/own-work-tenant";

export type CreateOwnSlotResult =
  | { ok: true; id: string; paymentStatus: "paid" | "unpaid" }
  | {
      ok: false;
      reason: "unauthorized" | "unavailable" | "invalid" | "slot_taken" | "no_hub";
      message?: string;
      alternatives?: string[];
    };

export type PaymentChoice = "received" | "due_later" | "request_link";

function overlaps(aStart: Date, aEnd: Date, busy: readonly BusyInterval[]): boolean {
  return busy.some((b) => b.startsAt < aEnd && b.endsAt > aStart);
}

function suggestAlternatives(
  startsAt: Date,
  durationMs: number,
  bufferMs: number,
  busy: readonly BusyInterval[],
): string[] {
  const out: string[] = [];
  let cursor = new Date(startsAt.getTime());
  for (let i = 0; i < 48 && out.length < 3; i += 1) {
    cursor = new Date(cursor.getTime() + 30 * 60_000);
    const end = new Date(cursor.getTime() + durationMs);
    const padded = new Date(end.getTime() + bufferMs);
    if (!overlaps(cursor, padded, busy)) {
      out.push(cursor.toISOString());
    }
  }
  return out;
}

function paymentStatusFor(choice: PaymentChoice): "paid" | "unpaid" {
  // Honest talent record: "received" marks paid without inventing Stripe money.
  // request_link / due_later stay unpaid until a real payment lands.
  return choice === "received" ? "paid" : "unpaid";
}

async function readBufferAfterMs(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
): Promise<number> {
  // supabase-read-unchecked-ok: missing hours row and a failed read both mean
  // the 15-minute default buffer — callers never treat empty as "configured".
  const { data } = await admin
    .from("talent_booking_hours")
    .select("buffer_after_min")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  const min =
    typeof data?.buffer_after_min === "number" && data.buffer_after_min >= 0
      ? data.buffer_after_min
      : 15;
  return min * 60_000;
}

/**
 * Create a manual slot booking for the signed-in talent on the platform hub.
 * Writes agency_bookings (commercial) + booking_talent + talent_bookings
 * (calendar mirror with the same id so loadTalentAgenda can join money).
 */
export async function createOwnSlotBooking(input: {
  clientName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  paymentChoice: PaymentChoice;
  allowOverlap?: boolean;
  /** Optional — without email or phone, no customers row is created (name-only OK). */
  contactEmail?: string | null;
  contactPhone?: string | null;
}): Promise<CreateOwnSlotResult> {
  const actor = await loadTalentActor();
  if (!actor.ok) return { ok: false, reason: "unauthorized" };

  const clientName = input.clientName.trim();
  const title = input.title.trim();
  if (!clientName || !title) {
    return { ok: false, reason: "invalid", message: "Name and service are required." };
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt.getTime() <= startsAt.getTime()
  ) {
    return { ok: false, reason: "invalid", message: "Pick a valid start and end." };
  }

  const ownTenant = await resolveTalentOwnWorkTenant();
  if (!ownTenant.ok) {
    return {
      ok: false,
      reason: "no_hub",
      message: "Platform hub is not available.",
    };
  }
  const tenantId = ownTenant.tenantId;
  const admin = actor.admin;

  const durationMs = endsAt.getTime() - startsAt.getTime();
  const bufferMs = await readBufferAfterMs(admin, actor.talentProfileId);
  const paddedEnd = new Date(endsAt.getTime() + bufferMs);
  const paymentStatus = paymentStatusFor(input.paymentChoice);

  let busy: BusyInterval[] = [];
  try {
    busy = await loadBusyIntervals({
      admin,
      talentProfileId: actor.talentProfileId,
      from: new Date(startsAt.getTime() - 60 * 60_000),
      to: new Date(endsAt.getTime() + 6 * 60 * 60_000),
    });
  } catch (err) {
    logServerError("agenda.createOwnSlot.busy", err);
    return { ok: false, reason: "unavailable" };
  }

  if (!input.allowOverlap && overlaps(startsAt, paddedEnd, busy)) {
    return {
      ok: false,
      reason: "slot_taken",
      message: "That time is taken. Pick another start.",
      alternatives: suggestAlternatives(startsAt, durationMs, bufferMs, busy),
    };
  }

  // B2 — ensureCustomer when email/phone present; name-only skips (no identity key).
  // Talent-owned pool so agency staff of this tenant cannot see private clients.
  let customerId: string | null = null;
  const contactEmail = (input.contactEmail ?? "").trim();
  const contactPhone = (input.contactPhone ?? "").trim();
  if (contactEmail || contactPhone) {
    const ensured = await ensureCustomer(
      {
        tenantId,
        email: contactEmail || null,
        phone: contactPhone || null,
        displayName: clientName,
        ownerTalentProfileId: actor.talentProfileId,
      },
      { admin },
    );
    if (ensured.ok) customerId = ensured.customerId;
  }

  const { data: agencyRow, error: agencyErr } = await admin
    .from("agency_bookings")
    .insert({
      tenant_id: tenantId,
      source_inquiry_id: null,
      owner_staff_id: actor.userId,
      created_by_staff_id: actor.userId,
      title,
      status: "confirmed" as never,
      payment_status: paymentStatus as never,
      currency_code: "MXN",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      contact_name: clientName,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      customer_id: customerId,
      source_type_snapshot: "manual",
      internal_notes:
        input.paymentChoice === "request_link"
          ? "Collect later. No payment link created yet. Client has not been told."
          : input.paymentChoice === "due_later"
            ? "Due later. Client has not been told."
            : "Payment recorded as received by talent. Client has not been told.",
    })
    .select("id")
    .single();

  if (agencyErr || !agencyRow) {
    logServerError("agenda.createOwnSlot.agency", agencyErr);
    return { ok: false, reason: "unavailable" };
  }

  const bookingId = agencyRow.id as string;
  const totals = computeBookingTalentRowTotals(1, 0, 0);

  const { error: legErr } = await admin.from("booking_talent").insert({
    tenant_id: tenantId,
    booking_id: bookingId,
    talent_profile_id: actor.talentProfileId,
    sort_order: 0,
    units: 1,
    pricing_unit: "event" as never,
    talent_cost_rate: 0,
    client_charge_rate: 0,
    talent_cost_total: totals.talent_cost_total,
    client_charge_total: totals.client_charge_total,
    gross_profit: totals.gross_profit,
  });
  if (legErr) {
    logServerError("agenda.createOwnSlot.booking_talent", legErr);
    await admin.from("agency_bookings").delete().eq("id", bookingId);
    return { ok: false, reason: "unavailable" };
  }

  const { error: calErr } = await admin.from("talent_bookings").insert({
    id: bookingId,
    talent_profile_id: actor.talentProfileId,
    tenant_id: tenantId,
    title,
    client_label: clientName,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    all_day: false,
    status: "confirmed",
    created_by_user_id: actor.userId,
  });

  if (calErr) {
    if (calErr.code === "23P01" || /overlap|exclusion/i.test(calErr.message ?? "")) {
      await admin.from("booking_talent").delete().eq("booking_id", bookingId);
      await admin.from("agency_bookings").delete().eq("id", bookingId);
      return {
        ok: false,
        reason: "slot_taken",
        message: "That time was just taken. Nothing was saved.",
        alternatives: suggestAlternatives(startsAt, durationMs, bufferMs, busy),
      };
    }
    logServerError("agenda.createOwnSlot.talent_bookings", calErr);
    await admin.from("booking_talent").delete().eq("booking_id", bookingId);
    await admin.from("agency_bookings").delete().eq("id", bookingId);
    return { ok: false, reason: "unavailable" };
  }

  revalidatePath("/", "layout");
  return { ok: true, id: bookingId, paymentStatus };
}
