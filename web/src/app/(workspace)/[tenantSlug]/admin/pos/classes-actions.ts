"use server";

/**
 * classes-actions.ts — the Classes mode's own commands: check a booking in,
 * mark attendance on a session, list the free times for a walk-in, book the
 * walk-in, and hold a seat for one at the counter's own draft.
 *
 * WHAT IS NOT HERE. Moving a booking is `rescheduleAppointment` and the
 * waitlist is `promoteFromWaitlist` / `acceptWaitlistPlace` /
 * `joinSessionWaitlist`, all in `lib/scheduling/appointments-actions.ts`,
 * proven by the appointments journey; the client calls them directly.
 * Collecting money is `posStartCollection` in `./actions.ts`, the Counter's
 * own charge, so a cash payment taken here is exactly a cash payment taken
 * at the counter: same allocation, same shift, same receipt.
 *
 * GUARD. Same as `./actions.ts`: workspace staff, `booking.payment.request`,
 * service-role client. A refusal is a WORD from a closed vocabulary
 * (`lib/pos/classes/refusals.ts`) that the client turns into a sentence.
 */

import { z } from "zod";

import { userHasCapability } from "@/lib/access";
import { checkInAppointment } from "@/lib/pos/classes/checkin";
import { appointmentState } from "@/lib/pos/classes/day";
import { bookWalkInAppointment, loadWalkInSlots } from "@/lib/pos/classes/walkin";
import { addLine, createDraftOrder, loadPosSale } from "@/lib/pos/draft";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { markAttendance } from "@/lib/sessions/attendance";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

type Refused = { ok: false; reason: string };

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export type ClassesCheckInResult = { ok: true } | Refused;

export async function classesCheckIn(input: {
  bookingId: string;
  expectedState: string;
}): Promise<ClassesCheckInResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ bookingId: uuid, expectedState: z.string().min(1).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const result = await checkInAppointment(g.admin, {
    tenantId: g.tenantId,
    bookingId: parsed.data.bookingId,
    expectedState: appointmentState(parsed.data.expectedState),
    actorUserId: g.userId,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true };
}

export type ClassesAttendanceResult = { ok: true; admittedCount: number } | Refused;

export async function classesMarkAttendance(input: { admissionId: string }): Promise<ClassesAttendanceResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ admissionId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const result = await markAttendance(g.admin, {
    tenantId: g.tenantId,
    admissionId: parsed.data.admissionId,
    actorUserId: g.userId,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, admittedCount: result.admittedCount };
}

export type ClassesSlotsResult =
  | { ok: true; starts: string[]; timeZone: string; emptyReason: string | null }
  | Refused;

export async function classesWalkInSlots(input: {
  offeringId: string;
  dayOffset: number;
}): Promise<ClassesSlotsResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ offeringId: uuid, dayOffset: z.number().int().min(-14).max(14) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { timezone } = await resolveTenantTimezone(g.tenantId);
  const result = await loadWalkInSlots(g.admin, {
    tenantId: g.tenantId,
    offeringId: parsed.data.offeringId,
    now: new Date(),
    timeZone: timezone,
    dayOffset: parsed.data.dayOffset,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, starts: result.starts, timeZone: result.timeZone, emptyReason: result.reason };
}

/**
 * What the client needs after a walk-in is booked: the order to collect on,
 * with the version and the balance the Counter's charge wants, read back
 * through `loadPosSale` (the reader the Counter itself uses) rather than
 * echoed from the write.
 */
export type ClassesWalkInResult =
  | {
      ok: true;
      orderId: string;
      bookingId: string | null;
      version: number;
      outstandingCents: number;
      currency: string;
    }
  | Refused;

async function saleAfterWrite(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  orderId: string,
  bookingId: string | null,
): Promise<ClassesWalkInResult> {
  const sale = await loadPosSale(admin, { tenantId, orderId });
  if (!sale.ok) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    orderId,
    bookingId,
    version: sale.sale.version,
    outstandingCents: sale.sale.outstandingCents,
    currency: sale.sale.currency,
  };
}

export async function classesBookWalkIn(input: {
  offeringId: string;
  startsAt: string;
  name: string;
  email: string;
  phone: string;
  /** Minted ONCE by the client when the form opens, so a double tap replays. */
  attemptKey: string;
}): Promise<ClassesWalkInResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      offeringId: uuid,
      startsAt: z.string().datetime(),
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().max(200),
      phone: z.string().trim().max(40),
      attemptKey: z.string().min(8).max(80),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const booked = await bookWalkInAppointment(g.admin, {
    tenantId: g.tenantId,
    offeringId: parsed.data.offeringId,
    startsAt: parsed.data.startsAt,
    customer: {
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    },
    actorUserId: g.userId,
    clientOrderKey: `pos-classes:${g.tenantId}:${parsed.data.attemptKey}`,
  });
  if (!booked.ok) return { ok: false, reason: booked.reason };
  return saleAfterWrite(g.admin, g.tenantId, booked.orderId, booked.bookingId);
}

/**
 * A seat for a walk-in, on the Counter's own draft. `createDraftOrder` +
 * `addLine` with the session (and the tier's variant when the night has
 * tiers) is exactly what the Counter's session picker does (C19); the seat
 * is HELD when the money is collected (`holdDraftOrderCapacity` inside
 * `startCollection`), and a full session refuses there as `sold_out`.
 */
export async function classesHoldSeat(input: {
  sessionId: string;
  offeringId: string;
  variantId: string | null;
}): Promise<ClassesWalkInResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ sessionId: uuid, offeringId: uuid, variantId: uuid.nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const draft = await createDraftOrder(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    context: "pos-classes",
  });
  if (!draft.ok) return { ok: false, reason: draft.reason };
  const line = await addLine(g.admin, {
    tenantId: g.tenantId,
    orderId: draft.orderId,
    line: {
      offeringId: parsed.data.offeringId,
      units: 1,
      sessionId: parsed.data.sessionId,
      variantId: parsed.data.variantId,
    },
  });
  if (!line.ok) return { ok: false, reason: line.reason };
  return saleAfterWrite(g.admin, g.tenantId, draft.orderId, null);
}
