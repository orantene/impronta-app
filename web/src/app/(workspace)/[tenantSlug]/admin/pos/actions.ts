"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { resolvePromo } from "@/lib/orders/promo-resolve";
import { addLine, createDraftOrder, listOpenPosSales, loadPosSale, removeLine, repriceAndValidate, updateLine } from "@/lib/pos/draft";
import { finalizeOrCancel, startCollection, submitToPreparation } from "@/lib/pos/collection";
import { closeShift, currentShift, openShift } from "@/lib/pos/shift";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";

const uuid = z.string().uuid();

/** One customer the counter can attach, as the panel renders them. */
export type PosCustomerHit = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
};

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

/**
 * Find an existing customer to name this sale's buyer.
 *
 * WHY THIS RETURNS CONTACT DETAILS AND NOT JUST AN ID. The engine names a
 * buyer at collection time and nowhere else: `startCollection` calls
 * `ensureCustomer` with an email or a phone and writes `orders.customer_id`
 * itself. `ensureCustomer` is idempotent on `(tenant, email)` and
 * `(tenant, phone)` — those are unique indexes — so handing back the found
 * customer's own email is what makes the counter reuse THAT row instead of
 * creating a second record for the same person, which is spec C10's rule
 * ("attach failure → retry with the same id") expressed through the write
 * path that actually exists.
 *
 * THE SEARCH TEXT IS SANITISED, not escaped. PostgREST's `or=` filter is a
 * comma-and-parenthesis grammar, so a customer searching for "Smith, J (x)"
 * would otherwise compose a filter rather than a term. Everything outside a
 * conservative set is dropped; the worst case is a search that finds less,
 * never one that reads more.
 */
export async function posSearchCustomers(query: string) {
  const g = await staff();
  if (!g.ok) return g;
  const cleaned = String(query ?? "")
    .replace(/[^\p{L}\p{N}@._+\- ]/gu, " ")
    .trim()
    .slice(0, 60);
  if (cleaned.length < 2) return { ok: true as const, rows: [] as PosCustomerHit[] };
  const like = `%${cleaned}%`;
  const { data, error } = await g.admin
    .from("customers")
    .select("id, display_name, email, phone_e164")
    .eq("tenant_id", g.tenantId)
    .or(`display_name.ilike.${like},email.ilike.${like},phone_e164.ilike.${like}`)
    .limit(8);
  if (error) {
    logServerError("pos.searchCustomers", error);
    return { ok: false as const, error: "unavailable" };
  }
  const rows: PosCustomerHit[] = (
    (data ?? []) as Array<{
      id: string;
      display_name: string | null;
      email: string | null;
      phone_e164: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    displayName: row.display_name?.trim() || row.email || row.phone_e164 || row.id.slice(0, 8),
    email: row.email,
    phone: row.phone_e164,
  }));
  return { ok: true as const, rows };
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
