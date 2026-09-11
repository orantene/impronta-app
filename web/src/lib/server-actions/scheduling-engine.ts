"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { decideApproval, requestApproval } from "@/lib/approvals/requests";
import {
  signBookingManageToken,
  verifyBookingManageToken,
} from "@/lib/bookings/manage-token";
import { writePolicyOverride } from "@/lib/bookings/policy-overrides";
import { setOfferingComponents } from "@/lib/catalog/packages";
import { setOfferingPricePhase } from "@/lib/catalog/price-phases";
import { sendOffer } from "@/lib/inquiry/inquiry-engine-offers";
import {
  amendmentDiscard,
  attachDeliverableFile,
  projectArchive,
  projectReopen,
  projectReplaceTalent,
  setDeliverableAmount,
} from "@/lib/projects/project-ops";
import { cancelBookingSet } from "@/lib/scheduling/cancel-booking";
import { rescheduleBooking } from "@/lib/scheduling/reschedule-booking";
import { sessionCancel, sessionMoveParticipant, sessionSetInstructor } from "@/lib/sessions/session-ops";
import { generateSessionsForSeries, upsertSessionSeries } from "@/lib/sessions/series-write";

const uuid = z.string().uuid();
const opKey = z.string().min(8).max(80);
const scope = z.enum(["this", "future", "series"]);

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "unavailable" as const };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export async function upsertSessionSeriesAction(input: {
  seriesId?: string;
  title: string;
  localTime: string;
  timeZone: string;
  weekdays: number[];
  durationMinutes: number;
  seats: number;
  startsOn: string;
  endsOn?: string | null;
  venueId: string;
  offeringId?: string | null;
  instructorUserId: string;
  isActive?: boolean;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      seriesId: uuid.optional(),
      title: z.string().trim().min(1).max(200),
      localTime: z.string().trim().min(5).max(8),
      timeZone: z.string().trim().min(1).max(80),
      weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      durationMinutes: z.number().int().min(1).max(1440),
      seats: z.number().int().min(0),
      startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      venueId: uuid,
      offeringId: uuid.nullable().optional(),
      instructorUserId: uuid,
      isActive: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return upsertSessionSeries(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function generateSessionsForSeriesAction(input: { seriesId: string; untilDate: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ seriesId: uuid, untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return generateSessionsForSeries(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function sessionSetInstructorAction(input: {
  sessionId: string;
  userId: string;
  scope: "this" | "future" | "series";
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ sessionId: uuid, userId: uuid, scope }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return sessionSetInstructor(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function sessionMoveParticipantAction(input: {
  admissionId: string;
  toSessionId: string;
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ admissionId: uuid, toSessionId: uuid, operationKey: opKey })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return sessionMoveParticipant(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function sessionCancelAction(input: {
  sessionId: string;
  scope: "this" | "future" | "series";
  reason: string;
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ sessionId: uuid, scope, reason: z.string().max(200), operationKey: opKey })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return sessionCancel(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function cancelBookingSetAction(input: {
  bookingId: string;
  operationKey: string;
  reason: string;
  by: "staff" | "customer";
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      bookingId: uuid,
      operationKey: opKey,
      reason: z.string().max(200),
      by: z.enum(["staff", "customer"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return cancelBookingSet(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function signBookingManageTokenAction(input: {
  bookingId: string;
  action: "cancel" | "reschedule";
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ bookingId: uuid, action: z.enum(["cancel", "reschedule"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const token = signBookingManageToken({
    bookingId: parsed.data.bookingId,
    tenantId: g.tenantId,
    action: parsed.data.action,
  });
  if (!token) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, token };
}

export async function cancelBookingByManageToken(input: {
  token: string;
  operationKey: string;
  reason: string;
}) {
  const parsed = z
    .object({ token: z.string().min(8), operationKey: opKey, reason: z.string().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const verified = verifyBookingManageToken(parsed.data.token);
  if (!verified.ok) return verified;
  if (verified.payload.action !== "cancel") return { ok: false as const, reason: "token_invalid" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return cancelBookingSet(admin, {
    tenantId: verified.payload.tenantId,
    bookingId: verified.payload.bookingId,
    operationKey: parsed.data.operationKey,
    reason: parsed.data.reason,
    by: "customer",
  });
}

/**
 * The customer's own reschedule from the signed link (A07 / R05). The
 * token names the booking, the tenant and the action; the move itself is
 * the existing `reschedule_booking_set` path (locks the set, moves the
 * allocations, refuses a taken slot). No staff session: the actor is the
 * customer, and the audit line says so through the empty actor id.
 */
export async function rescheduleBookingByManageToken(input: {
  token: string;
  operationKey: string;
  newStartsAt: string;
  expectedStartsAt: string | null;
}): Promise<
  | { ok: true; startsAt: string; endsAt: string; already: boolean }
  | { ok: false; reason: "token_invalid" | "not_reschedulable" | "slot_taken" | "conflict" | "not_found" | "wrong_tenant" | "invalid" | "unavailable" }
> {
  const parsed = z
    .object({
      token: z.string().min(8),
      operationKey: opKey,
      newStartsAt: z.string().min(10),
      expectedStartsAt: z.string().min(10).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const verified = verifyBookingManageToken(parsed.data.token);
  if (!verified.ok) return verified;
  if (verified.payload.action !== "reschedule") return { ok: false, reason: "token_invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const result = await rescheduleBooking(admin, {
    tenantId: verified.payload.tenantId,
    bookingId: verified.payload.bookingId,
    newStartsAt: parsed.data.newStartsAt,
    newEndsAt: null,
    actorUserId: "",
    operationKey: parsed.data.operationKey,
    expectedStartsAt: parsed.data.expectedStartsAt,
  });
  if (result.ok) return { ok: true, startsAt: result.startsAt, endsAt: result.endsAt, already: result.already };
  switch (result.reason) {
    case "not_reschedulable":
    case "conflict":
    case "not_found":
    case "wrong_tenant":
    case "invalid":
      return { ok: false, reason: result.reason };
    case "slot_taken":
    case "sold_out":
    case "ancestor_full":
      return { ok: false, reason: "slot_taken" };
    default:
      return { ok: false, reason: "unavailable" };
  }
}

export async function projectReplaceTalentAction(input: {
  bookingId: string;
  fromTalentId: string;
  toTalentId: string;
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      bookingId: uuid,
      fromTalentId: uuid,
      toTalentId: uuid,
      operationKey: opKey,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return projectReplaceTalent(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function amendmentSend(input: {
  inquiryId: string;
  offerId: string;
  expectedVersion: number;
  inquiryExpectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      offerId: uuid,
      expectedVersion: z.number().int(),
      inquiryExpectedVersion: z.number().int(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const result = await sendOffer(g.admin, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    offerId: parsed.data.offerId,
    actorUserId: g.userId,
    inquiryExpectedVersion: parsed.data.inquiryExpectedVersion,
    offerExpectedVersion: parsed.data.expectedVersion,
  });
  if (result.success) return { ok: true as const, offerId: parsed.data.offerId };
  if (result.conflict) return { ok: false as const, reason: "conflict" as const };
  if (result.forbidden) return { ok: false as const, reason: "not_found" as const };
  return { ok: false as const, reason: "unavailable" as const };
}

export async function amendmentDiscardAction(input: {
  offerId: string;
  expectedVersion: number;
  inquiryExpectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      offerId: uuid,
      expectedVersion: z.number().int(),
      inquiryExpectedVersion: z.number().int(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return amendmentDiscard(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function setDeliverableAmountAction(input: { deliverableId: string; amountCents: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ deliverableId: uuid, amountCents: z.number().int().nonnegative() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return setDeliverableAmount(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function attachDeliverableFileAction(input: { deliverableId: string; filePath: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ deliverableId: uuid, filePath: z.string().trim().min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return attachDeliverableFile(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function projectArchiveAction(input: { bookingId: string; reason: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ bookingId: uuid, reason: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return projectArchive(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function projectReopenAction(input: { bookingId: string; reason: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ bookingId: uuid, reason: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return projectReopen(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function setOfferingComponentsAction(input: {
  offeringId: string;
  components: Array<{ componentOfferingId: string; qty: number; required: boolean }>;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      offeringId: uuid,
      components: z.array(
        z.object({
          componentOfferingId: uuid,
          qty: z.number().int().min(1),
          required: z.boolean(),
        }),
      ),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return setOfferingComponents(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function setOfferingPricePhaseAction(input: {
  offeringId: string;
  variantId?: string | null;
  label: string;
  startsAt: string;
  endsAt?: string | null;
  priceCents: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      offeringId: uuid,
      variantId: uuid.nullable().optional(),
      label: z.string().trim().min(1).max(80),
      startsAt: z.string().min(10),
      endsAt: z.string().min(10).nullable().optional(),
      priceCents: z.number().int().nonnegative(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return setOfferingPricePhase(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function writePolicyOverrideAction(input: {
  offeringId: string;
  depositBps?: number | null;
  cancelFreeHours?: number | null;
  noShowFeeCents?: number | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      offeringId: uuid,
      depositBps: z.number().int().min(0).max(10000).nullable().optional(),
      cancelFreeHours: z.number().int().min(0).nullable().optional(),
      noShowFeeCents: z.number().int().min(0).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return writePolicyOverride(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function requestApprovalAction(input: {
  kind: "discount" | "refund";
  subjectId: string;
  operationKey: string;
  reason: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      kind: z.enum(["discount", "refund"]),
      subjectId: uuid,
      operationKey: opKey,
      reason: z.string().max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return requestApproval(g.admin, {
    tenantId: g.tenantId,
    requestedBy: g.userId,
    ...parsed.data,
  });
}

export async function decideApprovalAction(input: {
  requestId: string;
  decision: "approved" | "denied";
  reason: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      requestId: uuid,
      decision: z.enum(["approved", "denied"]),
      reason: z.string().max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return decideApproval(g.admin, {
    tenantId: g.tenantId,
    decidedBy: g.userId,
    ...parsed.data,
  });
}
