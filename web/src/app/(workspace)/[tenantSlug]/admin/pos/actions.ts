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

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
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

export async function posAddLine(input: { orderId: string; offeringId: string; units: number; sessionId?: string | null }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    offeringId: uuid,
    units: z.number().int().positive(),
    sessionId: z.string().uuid().nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return addLine(g.admin, {
    tenantId: g.tenantId,
    orderId: parsed.data.orderId,
    line: {
      offeringId: parsed.data.offeringId,
      units: parsed.data.units,
      sessionId: parsed.data.sessionId,
    },
  });
}

export async function posUpdateLine(input: { orderId: string; lineId: string; units: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    lineId: uuid,
    units: z.number().int().positive(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return updateLine(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function posRemoveLine(input: { orderId: string; lineId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ orderId: uuid, lineId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return removeLine(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function posReprice(input: { orderId: string; promoCode?: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ orderId: uuid, promoCode: z.string().trim().max(40).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return repriceAndValidate(
    g.admin,
    { tenantId: g.tenantId, orderId: parsed.data.orderId, promoCode: parsed.data.promoCode },
    {
      resolvePromo: async (args) => {
        const resolved = await resolvePromo(g.admin, {
          tenantId: args.tenantId,
          code: args.code,
          customerId: args.customerId,
          lines: args.lines,
        });
        if (!resolved.ok) return { ok: false as const, error: "That code could not be applied." };
        return { ok: true as const, discountCents: resolved.discountCents };
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
  idempotencyKey?: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    method: z.enum(["cash", "online_card"]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    displayName: z.string().optional(),
    amountCents: z.number().int().positive().optional(),
    tenderedCents: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().min(8).max(80).optional(),
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
    },
    { ensureCustomer: (c) => ensureCustomer(c, { admin: g.admin }) },
  );
}

export async function posCancelSale(orderId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  return finalizeOrCancel(g.admin, { tenantId: g.tenantId, orderId });
}

export async function posSubmitPrep(orderId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "invalid" };
  return submitToPreparation(g.admin, { tenantId: g.tenantId, orderId });
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
  const g = await staff();
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
  const g = await staff();
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
