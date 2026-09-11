"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { lockTill, readDeviceSession, switchOperator, unlockTill } from "@/lib/pos/device-session";
import { linkBooking } from "@/lib/pos/link-booking";
import { setTip } from "@/lib/pos/tip";
import { createPaymentLink as mintPaymentLink } from "@/lib/payments/links";
import { recordShiftMovement } from "@/lib/pos/shift-movements";
import {
  waitlistAcceptOffer as acceptWaitlistOfferHold,
  waitlistDeclineOffer as declineWaitlistOfferHold,
  waitlistOfferPlace as placeWaitlistOfferHold,
} from "@/lib/scheduling/waitlist-offers";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "unavailable" as const };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export async function posLockTill(input: { deviceKey: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ deviceKey: z.string().trim().min(8).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return lockTill(g.admin, { tenantId: g.tenantId, deviceKey: parsed.data.deviceKey });
}

/**
 * `userId` is the person picked on the lock screen (`POSLock`: "Who's on the
 * register?"); it defaults to the signed-in account. The PIN is the proof:
 * `pos_unlock_till` verifies it against THAT person's hash, so naming
 * somebody else without their PIN is refused as `pin_invalid`.
 */
export async function posUnlockTill(input: { deviceKey: string; pin: string; userId?: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    deviceKey: z.string().trim().min(8).max(80),
    pin: z.string().regex(/^[0-9]{4,6}$/),
    userId: uuid.optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return unlockTill(g.admin, {
    tenantId: g.tenantId,
    deviceKey: parsed.data.deviceKey,
    userId: parsed.data.userId ?? g.userId,
    pin: parsed.data.pin,
  });
}

export async function posSwitchOperator(input: { deviceKey: string; pin: string; userId?: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    deviceKey: z.string().trim().min(8).max(80),
    pin: z.string().regex(/^[0-9]{4,6}$/),
    userId: uuid.optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return switchOperator(g.admin, {
    tenantId: g.tenantId,
    deviceKey: parsed.data.deviceKey,
    userId: parsed.data.userId ?? g.userId,
    pin: parsed.data.pin,
  });
}

/** The contract's reader: this device's session, or `no_session`. */
export async function posCurrentDeviceSession(input: { deviceKey: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ deviceKey: z.string().trim().min(8).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return readDeviceSession(g.admin, { tenantId: g.tenantId, deviceKey: parsed.data.deviceKey });
}

export async function posLinkBooking(input: {
  orderId: string;
  bookingKind: "talent_booking" | "agency_booking" | "admission";
  bookingId: string;
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    bookingKind: z.enum(["talent_booking", "agency_booking", "admission"]),
    bookingId: uuid,
    operationKey: z.string().min(8).max(80),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return linkBooking(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function posSetTip(input: {
  orderId: string;
  tipCents: number;
  operationKey: string;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    tipCents: z.number().int().nonnegative(),
    operationKey: z.string().min(8).max(80),
    expectedVersion: z.number().int().positive(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return setTip(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function createPaymentLink(input: {
  orderId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    amountCents: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(80),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
  const publicOrigin = host ? `${proto}://${host}` : "";
  return mintPaymentLink(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    publicOrigin,
    ...parsed.data,
  });
}

export async function posRecordShiftMovement(input: {
  kind: "paid_in" | "paid_out" | "drop" | "float_add";
  amountCents: number;
  reason: string;
  shiftId?: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    kind: z.enum(["paid_in", "paid_out", "drop", "float_add"]),
    amountCents: z.number().int().positive(),
    reason: z.string().trim().min(1).max(200),
    shiftId: uuid.optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return recordShiftMovement(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    ...parsed.data,
  });
}

export async function waitlistOfferPlace(input: {
  entryId: string;
  operationKey: string;
  ttlSeconds?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    entryId: uuid,
    operationKey: z.string().min(8).max(80),
    ttlSeconds: z.number().int().positive().max(86400).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return placeWaitlistOfferHold(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function waitlistAcceptOffer(input: { offerId: string; operationKey: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    offerId: uuid,
    operationKey: z.string().min(8).max(80),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return acceptWaitlistOfferHold(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function waitlistDeclineOffer(input: { offerId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ offerId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return declineWaitlistOfferHold(g.admin, { tenantId: g.tenantId, offerId: parsed.data.offerId });
}
