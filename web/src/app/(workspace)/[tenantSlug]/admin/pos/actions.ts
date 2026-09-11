"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { sendEmailResult } from "@/lib/email";
import { orderConfirmationSubject, renderOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { getRequestLocale } from "@/i18n/request-locale";
import { resolvePromo } from "@/lib/orders/promo-resolve";
import { addLine, createDraftOrder, listOpenPosSales, loadPosSale, removeLine, repriceAndValidate, updateLine } from "@/lib/pos/draft";
import { finalizeOrCancel, startCollection, submitToPreparation } from "@/lib/pos/collection";
import { closeShift, currentShift, openShift } from "@/lib/pos/shift";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import { findActiveLinkByCode } from "@/lib/links/link-store";
import { scanTarget } from "@/lib/pos/scan-code";

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
  /** A price variant (`Options` on the tile); the engine prices it (`draft.ts`). */
  variantId?: string | null;
  expectedVersion?: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    orderId: uuid,
    offeringId: uuid,
    units: z.number().int().positive(),
    sessionId: z.string().uuid().nullable().optional(),
    variantId: z.string().uuid().nullable().optional(),
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
      variantId: parsed.data.variantId,
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

// ─────────────────────────────────────────────────────────────────────────
// The customer display (design boards D01 to D08).
//
// TWO ACTIONS, BOTH THROUGH THE COUNTER'S OWN READER AND WRITERS. The display
// is a device the workspace owns, signed in as its staff, behind the same
// `booking.payment.request` capability as the counter (`staff()` above). It
// reads the sale through `loadPosSale`, the reader every counter screen uses,
// so its totals are the counter's totals by construction. It writes exactly
// one thing, the receipt contact, through `ensureCustomer` (the same attach
// the counter's collection uses) and the order-confirmation email that
// already exists for online orders.
//
// POLLED, NOT PUSHED. `posDisplayRead` is called every couple of seconds by
// the display. There is no realtime channel to keep alive and nothing new to
// deploy; one small read per tick is what a second screen costs.
// ─────────────────────────────────────────────────────────────────────────

export type PosDisplayLine = {
  label: string;
  units: number;
  totalCents: number;
};

/** The sale as the display renders it. Figures are the reader's, untouched. */
export type PosDisplaySale = {
  orderId: string;
  version: number;
  currency: string;
  paymentState: "unpaid" | "pending" | "paid" | "cancelled";
  lines: PosDisplayLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  depositPaidCents: number;
  outstandingCents: number;
  /** The attached customer's first name, for "Hi Laura". Null for a walk-in. */
  customerName: string | null;
  /** Newest money row under the sale, by `requested_at`. */
  latestTransaction: { status: string; paidVia: string | null } | null;
};

export type PosDisplayReadResult =
  | {
      ok: true;
      /** The workspace's own name, for the idle screen. */
      workspaceName: string;
      /** Newest open draft on this workspace, for a display with no counter beside it. */
      newestOpenOrderId: string | null;
      /** The sale asked for, or null when there is none / it is not this workspace's. */
      sale: PosDisplaySale | null;
    }
  | { ok: false; error: string };

/**
 * One tick of the display.
 *
 * `orderId` null means "nothing followed yet": the newest open sale is still
 * returned so a display with no counter on its own device can adopt one. A
 * sale that is not this workspace's, or does not exist, reads as `null`
 * rather than as a refusal: from the customer's side, that is simply nothing
 * to show.
 */
export async function posDisplayRead(input: { orderId: string | null }): Promise<PosDisplayReadResult> {
  const g = await staff();
  if (!g.ok) return g;
  const orderId = uuid.safeParse(input.orderId).success ? input.orderId : null;

  const [open, nameRow] = await Promise.all([
    listOpenPosSales(g.admin, g.tenantId),
    g.admin.from("agencies").select("display_name").eq("id", g.tenantId).maybeSingle(),
  ]);
  if (nameRow.error) logServerError("pos.display.name", nameRow.error);
  const workspaceName =
    (nameRow.data as { display_name?: string | null } | null)?.display_name?.trim() || g.tenantSlug;
  const newestOpenOrderId = open.ok && open.rows.length > 0 ? open.rows[0].id : null;

  if (!orderId) return { ok: true, workspaceName, newestOpenOrderId, sale: null };

  const loaded = await loadPosSale(g.admin, { tenantId: g.tenantId, orderId });
  if (!loaded.ok) {
    if (loaded.reason === "unavailable") return { ok: false, error: "unavailable" };
    return { ok: true, workspaceName, newestOpenOrderId, sale: null };
  }
  const sale = loaded.sale;

  const [customer, txn] = await Promise.all([
    sale.customerId
      ? g.admin.from("customers").select("display_name").eq("id", sale.customerId).eq("tenant_id", g.tenantId).maybeSingle()
      : Promise.resolve(null),
    g.admin
      .from("booking_transactions")
      .select("status, metadata, requested_at")
      .eq("order_id", sale.orderId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (customer?.error) logServerError("pos.display.customer", customer.error);
  if (txn.error) logServerError("pos.display.txn", txn.error);

  const displayName = (customer?.data as { display_name?: string | null } | null)?.display_name?.trim();
  const customerName = displayName ? displayName.split(/\s+/)[0] : null;

  const txnRow = txn.data as { status?: string; metadata?: unknown } | null;
  const metadata =
    txnRow && typeof txnRow.metadata === "object" && txnRow.metadata !== null && !Array.isArray(txnRow.metadata)
      ? (txnRow.metadata as Record<string, unknown>)
      : {};
  const paidVia = typeof metadata.paid_via === "string" ? metadata.paid_via : null;

  return {
    ok: true,
    workspaceName,
    newestOpenOrderId,
    sale: {
      orderId: sale.orderId,
      version: sale.version,
      currency: sale.currency,
      paymentState: sale.paymentState,
      lines: sale.lines.map((line) => ({ label: line.label, units: line.units, totalCents: line.totalCents })),
      subtotalCents: sale.subtotalCents,
      discountCents: sale.discountCents,
      totalCents: sale.totalCents,
      depositPaidCents: sale.depositPaidCents,
      outstandingCents: sale.outstandingCents,
      customerName,
      latestTransaction: txnRow && typeof txnRow.status === "string" ? { status: txnRow.status, paidVia } : null,
    },
  };
}

export type PosDisplayReceiptResult =
  | { ok: true; status: "sent" | "skipped" }
  | { ok: false; reason: "invalid" | "not_paid" | "not_allowed" | "unavailable" | "send_failed"; error: string };

/**
 * D08: "Where should we send your receipt?" with an email typed in.
 *
 * Refused unless the order is PAID: a receipt for a sale that has not
 * settled is a receipt for nothing. The address becomes the sale's customer
 * through `ensureCustomer` (idempotent on `(tenant, email)`, the same row the
 * counter's own collection would have made), attached only when the sale has
 * no customer yet, so a name the cashier already attached is never overwritten
 * by whatever a customer types. The email is the order-confirmation the
 * online path already sends, carrying the public `/r/<code>` receipt link.
 *
 * A `skipped` send is reported as such, not as `sent`: it means this server
 * has no email provider configured, and the screen must not thank a customer
 * for an email that never left.
 */
export async function posDisplayEmailReceipt(input: { orderId: string; email: string }): Promise<PosDisplayReceiptResult> {
  const g = await staff();
  if (!g.ok) {
    return { ok: false, reason: g.error === "not_allowed" ? "not_allowed" : "unavailable", error: g.error };
  }
  const parsed = z.object({ orderId: uuid, email: z.string().trim().email().max(254) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", error: "invalid" };

  const loaded = await loadPosSale(g.admin, { tenantId: g.tenantId, orderId: parsed.data.orderId });
  if (!loaded.ok) return { ok: false, reason: "unavailable", error: loaded.reason };
  const sale = loaded.sale;
  if (sale.paymentState !== "paid") return { ok: false, reason: "not_paid", error: "not_paid" };

  const ensured = await ensureCustomer(
    { tenantId: g.tenantId, email: parsed.data.email },
    { admin: g.admin },
  );
  if (!ensured.ok) {
    return { ok: false, reason: ensured.reason === "bad_email" ? "invalid" : "unavailable", error: ensured.error };
  }
  if (!sale.customerId) {
    const attach = await g.admin
      .from("orders")
      .update({ customer_id: ensured.customerId })
      .eq("id", sale.orderId)
      .eq("tenant_id", g.tenantId)
      .is("customer_id", null);
    if (attach.error) logServerError("pos.display.attach", attach.error);
  }

  const [receipt, nameRow] = await Promise.all([
    g.admin.from("orders").select("receipt_code").eq("id", sale.orderId).eq("tenant_id", g.tenantId).maybeSingle(),
    g.admin.from("agencies").select("display_name").eq("id", g.tenantId).maybeSingle(),
  ]);
  if (receipt.error) logServerError("pos.display.receiptCode", receipt.error);
  const code = (receipt.data as { receipt_code?: string | null } | null)?.receipt_code;
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
  const receiptUrl = typeof code === "string" && code && host ? `${proto}://${host}/r/${code}` : null;
  const tenantName =
    (nameRow.data as { display_name?: string | null } | null)?.display_name?.trim() || g.tenantSlug;

  // The email template ships in English and Spanish; a French request reads
  // the English one rather than a half-translated page.
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const email = {
    locale,
    tenantName,
    customerName: null,
    currency: sale.currency,
    totalCents: sale.totalCents,
    lines: sale.lines.map((line) => ({ label: line.label, units: line.units, totalCents: line.totalCents })),
    collectedCents: sale.depositPaidCents,
    receiptUrl,
  } as const;
  const sent = await sendEmailResult({
    to: parsed.data.email,
    subject: orderConfirmationSubject(email),
    html: renderOrderConfirmationEmail(email),
    tenantId: g.tenantId,
    tenantName,
  });
  if (sent.status === "failed") return { ok: false, reason: "send_failed", error: sent.error };
  return { ok: true, status: sent.status };
}

// ─────────────────────────────────────────────────────────────────────────
// The scanner (design boards C23, C24; ledger POS-2.8).
// ─────────────────────────────────────────────────────────────────────────

export type PosScanResolveResult =
  | { ok: true; offeringId: string; title: string }
  | { ok: false; reason: "no_match" | "not_allowed" | "unavailable" | "invalid"; error: string };

/**
 * What a scanned code sells, if anything.
 *
 * `scanTarget` decides the shape (an offering id, or a link code); this
 * action asks the database. A link resolves only when it is this workspace's
 * own active link AND names an offering in `context.offering_id`; the
 * offering must be published and this workspace's, the same two checks
 * `addLine` makes before it writes, so a scan that resolves here is a scan
 * that will add. Nothing here writes: the counter adds the line through
 * `posAddLine` like any tap on a tile, so the basket has one write path.
 */
export async function posResolveScanCode(raw: string): Promise<PosScanResolveResult> {
  const g = await staff();
  if (!g.ok) {
    return { ok: false, reason: g.error === "not_allowed" ? "not_allowed" : "unavailable", error: g.error };
  }
  const text = typeof raw === "string" ? raw.slice(0, 512) : "";
  const target = scanTarget(text);
  if (!target) return { ok: false, reason: "no_match", error: "no_match" };

  let offeringId: string;
  if (target.kind === "offering") {
    offeringId = target.offeringId;
  } else {
    const link = await findActiveLinkByCode(g.tenantId, target.code);
    const fromLink = (link?.context as { offering_id?: unknown } | undefined)?.offering_id;
    if (typeof fromLink !== "string" || !uuid.safeParse(fromLink).success) {
      return { ok: false, reason: "no_match", error: "no_match" };
    }
    offeringId = fromLink;
  }

  const { data, error } = await g.admin
    .from("talent_offerings")
    .select("id, title, status")
    .eq("id", offeringId)
    .eq("tenant_id", g.tenantId)
    .eq("owner_kind", "workspace")
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    logServerError("pos.resolveScan", error);
    return { ok: false, reason: "unavailable", error: "unavailable" };
  }
  const row = data as { id: string; title: string | null } | null;
  if (!row) return { ok: false, reason: "no_match", error: "no_match" };
  return { ok: true, offeringId: row.id, title: row.title?.trim() || row.id.slice(0, 8) };
}
