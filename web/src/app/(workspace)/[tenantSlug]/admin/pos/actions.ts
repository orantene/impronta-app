"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { resolvePromo } from "@/lib/orders/promo-resolve";
import { addLine, createDraftOrder, listOpenPosSales, loadPosSale, removeLine, repriceAndValidate, updateLine } from "@/lib/pos/draft";
import { finalizeOrCancel, startCollection, submitToPreparation } from "@/lib/pos/collection";
import { closeShift, currentShift, openShift } from "@/lib/pos/shift";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";

const uuid = z.string().uuid();

type PosStaffCapability =
  | "booking.payment.request"
  | "booking.payment.refund"
  | "booking.payment.mark_received";

async function staff(capability: PosStaffCapability = "booking.payment.request") {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability(capability, guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, tenantSlug: guard.tenantSlug, admin };
}

export async function posCreateDraft(context?: string) {
  const g = await staff();
  if (!g.ok) return g;
  return createDraftOrder(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    context: context?.trim() || "pos",
  });
}

export async function posAddLine(input: {
  orderId: string;
  offeringId: string;
  units: number;
  sessionId?: string | null;
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    offeringId: uuid,
    units: z.number().int().positive(),
    sessionId: z.string().uuid().nullable().optional(),
    expectedVersion: z.number().int().positive().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return addLine(g.admin, {
    tenantId: g.tenantId,
    orderId: parsed.data.orderId,
    expectedVersion: parsed.data.expectedVersion,
    line: {
      offeringId: parsed.data.offeringId,
      units: parsed.data.units,
      sessionId: parsed.data.sessionId,
    },
  });
}

export async function posUpdateLine(input: {
  orderId: string;
  lineId: string;
  units: number;
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    lineId: uuid,
    units: z.number().int().positive(),
    expectedVersion: z.number().int().positive().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return updateLine(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function posRemoveLine(input: { orderId: string; lineId: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    lineId: uuid,
    expectedVersion: z.number().int().positive().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return removeLine(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function posReprice(input: { orderId: string; promoCode?: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    promoCode: z.string().trim().max(40).optional(),
    expectedVersion: z.number().int().positive().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return repriceAndValidate(
    g.admin,
    {
      tenantId: g.tenantId,
      orderId: parsed.data.orderId,
      promoCode: parsed.data.promoCode,
      expectedVersion: parsed.data.expectedVersion,
    },
    {
      resolvePromo: async (args) => {
        const resolved = await resolvePromo(g.admin, {
          tenantId: args.tenantId,
          code: args.code,
          customerId: args.customerId,
          lines: args.lines,
        });
        if (!resolved.ok) return { ok: false as const, error: "That code could not be applied." };
        return { ok: true as const, discountCents: resolved.discountCents, codeId: resolved.codeId };
      },
    },
  );
}

export async function posStartCollection(input: {
  orderId: string;
  method: "cash" | "online_card";
  email?: string;
  phone?: string;
  displayName?: string;
  amountCents?: number;
  tenderedCents?: number;
  /** REQUIRED. Names THIS allocation so a retry replays instead of collecting again. */
  idempotencyKey: string;
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    method: z.enum(["cash", "online_card"]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    displayName: z.string().optional(),
    amountCents: z.number().int().nonnegative().optional(),
    tenderedCents: z.number().int().nonnegative().optional(),
    // No longer optional. An unnamed collection cannot be told apart from a new
    // one, and the old fallback minted a key per call, so every retry took the
    // money twice.
    idempotencyKey: z.string().min(8).max(80),
    expectedVersion: z.number().int().positive().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
  const base = host ? `${proto}://${host}` : "";
  const path = `/${g.tenantSlug}/admin/pos`;
  return startCollection(
    g.admin,
    {
      tenantId: g.tenantId,
      orderId: parsed.data.orderId,
      actorUserId: g.userId,
      method: parsed.data.method,
      contact: {
        email: parsed.data.email,
        phone: parsed.data.phone,
        displayName: parsed.data.displayName,
      },
      successUrl: `${base}${path}?order=${parsed.data.orderId}&collected=1`,
      cancelUrl: `${base}${path}?order=${parsed.data.orderId}`,
      amountCents: parsed.data.amountCents,
      tenderedCents: parsed.data.tenderedCents,
      idempotencyKey: parsed.data.idempotencyKey,
      expectedVersion: parsed.data.expectedVersion,
    },
    { ensureCustomer: (c) => ensureCustomer(c, { admin: g.admin }), onOrderPaid: (ctx) => mintAdmissionsForPaidOrder(g.admin, ctx).then(() => undefined) },
  );
}

export async function posCancelSale(orderId: string, expectedVersion?: number) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  return finalizeOrCancel(g.admin, {
    tenantId: g.tenantId,
    orderId,
    expectedVersion,
  });
}

export async function posSubmitPrep(input: {
  orderId: string;
  destination?: "table" | "pickup" | "counter";
  promisedAt?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      orderId: uuid,
      destination: z.enum(["table", "pickup", "counter"]).optional(),
      promisedAt: z.string().min(10).max(40).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  if (parsed.data.destination === "pickup") {
    const when = parsed.data.promisedAt ? Date.parse(parsed.data.promisedAt) : NaN;
    if (!Number.isFinite(when) || when <= Date.now()) {
      return { ok: false as const, error: "pickup_window" };
    }
  }
  return submitToPreparation(g.admin, {
    tenantId: g.tenantId,
    orderId: parsed.data.orderId,
    destination: parsed.data.destination,
    promisedAt: parsed.data.promisedAt ?? null,
  });
}

export async function posLoadOpen() {
  const g = await staff();
  if (!g.ok) return g;
  return listOpenPosSales(g.admin, g.tenantId);
}

export async function posLoadSale(orderId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  return loadPosSale(g.admin, { tenantId: g.tenantId, orderId });
}

export async function posCurrentShift() {
  const g = await staff();
  if (!g.ok) return g;
  return currentShift(g.admin, { tenantId: g.tenantId });
}

export async function posOpenShift(openingCashCents: number) {
  const g = await staff("booking.payment.mark_received");
  if (!g.ok) return g;
  const parsed = z.number().int().nonnegative().safeParse(openingCashCents);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return openShift(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    openingCashCents: parsed.data,
  });
}

export async function posCloseShift(input: { closingCashCents: number; expectedVersion?: number }) {
  const g = await staff("booking.payment.mark_received");
  if (!g.ok) return g;
  const parsed = z.object({
    closingCashCents: z.number().int().nonnegative(),
    expectedVersion: z.number().int().positive().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return closeShift(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    closingCashCents: parsed.data.closingCashCents,
    expectedVersion: parsed.data.expectedVersion,
  });
}
