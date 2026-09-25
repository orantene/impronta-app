import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { syncConversationRecord } from "@/lib/messaging/record-sync";
import { generateOpaqueCode } from "@/lib/links/code";
import { reserveCollection, reservationTtlSeconds } from "@/lib/pos/collection-reservations";
import type { Admin } from "@/lib/pos/sale-rows";
import { settleAtDoor } from "@/lib/orders/settle-at-door";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import { expireCheckoutSession } from "@/lib/payments/stripe-checkout";
import { expireBoundSession } from "@/lib/payments/link-checkout";

type PaymentEnv = Readonly<Record<string, string | undefined>>;

/**
 * Mock money is a demo, and on the production deployment it is refused
 * outright: a mock link settles on `?confirm=mock`, so anyone holding its code
 * could mark it paid with no money moving (audit 2026-09-25, defect #3).
 */
export function mockPaymentsAllowed(env: PaymentEnv = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}

/** Which provider a link is minted on; null when none may be used here. */
export function paymentLinkProvider(env: PaymentEnv = process.env): "stripe" | "mock" | null {
  if (env.STRIPE_SECRET_KEY) return "stripe";
  return mockPaymentsAllowed(env) ? "mock" : null;
}

export type CreatePaymentLinkResult =
  | { ok: true; code: string; url: string; amountCents: number; expiresAt: string; already?: boolean }
  | {
      ok: false;
      reason:
        | "exceeds_outstanding"
        | "provider_unavailable"
        | "expired"
        | "not_found"
        | "wrong_tenant"
        | "conflict"
        | "unavailable"
        | "invalid";
    };

export async function createPaymentLink(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    amountCents: number;
    idempotencyKey: string;
    /** Tests only: the environment the provider is decided from. */
    env?: PaymentEnv;
    /** Who minted the link; null for a flow with no signed-in operator (a guest paying their share). */
    actorUserId: string | null;
    publicOrigin: string;
    /**
     * The conversation the request was made from (a Messages payment request).
     * Written to `payment_links.inquiry_id` at mint time and stamped onto the
     * order when it names no conversation yet, so `/pay/<code>` can always
     * hand the customer "Back to the conversation" (D-145, D-150).
     */
    inquiryId?: string | null;
  },
): Promise<CreatePaymentLinkResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, reason: "invalid" };
  if (input.idempotencyKey.trim().length < 8) return { ok: false, reason: "invalid" };
  // The reservation and `payment_links.created_by` are uuid columns: an empty
  // string is an invalid uuid (22P02), not an absent one. Absent is NULL.
  const actorUserId = input.actorUserId?.trim() ? input.actorUserId.trim() : null;

  const { data: existing, error: existingErr } = await admin
    .from("payment_links")
    .select("code, amount_cents, expires_at, status")
    .eq("tenant_id", input.tenantId)
    .eq("operation_key", input.idempotencyKey.trim())
    .maybeSingle();
  if (existingErr) {
    logServerError("payments.createPaymentLink.existing", existingErr);
    return { ok: false, reason: "unavailable" };
  }
  if (existing) {
    const row = existing as { code: string; amount_cents: number; expires_at: string; status: string };
    if (row.status === "expired" || row.status === "cancelled") return { ok: false, reason: "expired" };
    if (input.inquiryId) {
      await attachPaymentLinkInquiry(admin, { tenantId: input.tenantId, code: row.code, orderId: input.orderId, inquiryId: input.inquiryId });
    }
    return {
      ok: true,
      code: row.code,
      url: `${input.publicOrigin.replace(/\/$/, "")}/pay/${row.code}`,
      amountCents: Number(row.amount_cents),
      expiresAt: row.expires_at,
      already: true,
    };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, currency")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("payments.createPaymentLink.order", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const o = order as { tenant_id: string; status: string; currency: string };
  if (o.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  // Decided BEFORE the balance is claimed: a link that could never be paid
  // must not hold the order's money for half an hour.
  const provider = paymentLinkProvider(input.env);
  if (!provider) return { ok: false, reason: "provider_unavailable" };

  const claimed = await reserveCollection(admin, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    operationKey: input.idempotencyKey.trim(),
    amountCents: input.amountCents,
    method: "link",
    actorUserId,
    ttlSeconds: reservationTtlSeconds("link"),
  });
  if (!claimed.ok) {
    if (claimed.reason === "exceeds_outstanding") return { ok: false, reason: "exceeds_outstanding" };
    if (claimed.reason === "conflict") return { ok: false, reason: "conflict" };
    if (claimed.reason === "not_found") return { ok: false, reason: "not_found" };
    if (claimed.reason === "wrong_tenant") return { ok: false, reason: "wrong_tenant" };
    return { ok: false, reason: "unavailable" };
  }

  const code = generateOpaqueCode();
  const expiresAt = claimed.expiresAt ?? new Date(Date.now() + 1980_000).toISOString();
  const { error: insErr } = await admin.from("payment_links").insert({
    tenant_id: input.tenantId,
    order_id: input.orderId,
    code,
    amount_cents: claimed.amountCents,
    currency: o.currency,
    provider,
    provider_ref: claimed.reservationId,
    status: "open",
    expires_at: expiresAt,
    created_by: actorUserId,
    operation_key: input.idempotencyKey.trim(),
    reservation_id: claimed.reservationId,
    inquiry_id: input.inquiryId ?? null,
  });
  if (insErr) {
    logServerError("payments.createPaymentLink.insert", insErr);
    return { ok: false, reason: "unavailable" };
  }
  if (input.inquiryId) {
    await attachPaymentLinkInquiry(admin, { tenantId: input.tenantId, code, orderId: input.orderId, inquiryId: input.inquiryId });
  }
  // Messages v5 / S2: an open link means "requested" on the order chip.
  await syncConversationRecord(admin, { tenantId: input.tenantId, kind: "order", recordId: input.orderId });
  return {
    ok: true,
    code,
    url: `${input.publicOrigin.replace(/\/$/, "")}/pay/${code}`,
    amountCents: claimed.amountCents,
    expiresAt,
  };
}

/**
 * Name the conversation on a link and on its order. The order is stamped only
 * when it names no conversation yet: an order that already belongs to another
 * thread is left alone. Both writes are idempotent, so a reused link (same
 * operation key) can be attached again without harm.
 */
export async function attachPaymentLinkInquiry(
  admin: Admin,
  input: { tenantId: string; code: string; orderId: string; inquiryId: string },
): Promise<void> {
  const { error: linkErr } = await admin
    .from("payment_links")
    .update({ inquiry_id: input.inquiryId })
    .eq("tenant_id", input.tenantId)
    .eq("code", input.code)
    .is("inquiry_id", null);
  if (linkErr) logServerError("payments.attachPaymentLinkInquiry.link", linkErr);
  const { error: orderErr } = await admin
    .from("orders")
    .update({ inquiry_id: input.inquiryId })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .is("inquiry_id", null);
  if (orderErr) logServerError("payments.attachPaymentLinkInquiry.order", orderErr);
}

export async function loadPaymentLinkByCode(
  admin: Admin,
  code: string,
): Promise<
  | {
      ok: true;
      tenantId: string;
      orderId: string;
      amountCents: number;
      status: string;
      provider: string;
      expiresAt: string;
      /** The conversation the link was requested from (a Messages payment request), when any. */
      inquiryId: string | null;
    }
  | {
      ok: false;
      reason: "expired";
      /** An expired link still knows its sale and its conversation: that is where the customer asks for a fresh request (D-150). */
      tenantId: string;
      orderId: string;
      inquiryId: string | null;
    }
  | { ok: false; reason: "not_found" | "unavailable" }
> {
  const { data, error } = await admin
    .from("payment_links")
    .select("tenant_id, order_id, amount_cents, status, provider, expires_at, inquiry_id")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    logServerError("payments.loadPaymentLinkByCode", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as {
    tenant_id: string;
    order_id: string;
    amount_cents: number;
    status: string;
    provider: string;
    expires_at: string;
    inquiry_id?: string | null;
  };
  if (row.status === "expired" || Date.parse(row.expires_at) <= Date.now()) {
    return { ok: false, reason: "expired", tenantId: row.tenant_id, orderId: row.order_id, inquiryId: row.inquiry_id ?? null };
  }
  return {
    ok: true,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    amountCents: Number(row.amount_cents),
    status: row.status,
    provider: row.provider,
    expiresAt: row.expires_at,
    inquiryId: row.inquiry_id ?? null,
  };
}

export async function listPaymentLinks(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<
  | {
      ok: true;
      links: Array<{
        code: string;
        amountCents: number;
        status: string;
        expiresAt: string;
        url: string;
      }>;
    }
  | { ok: false; reason: "unavailable" }
> {
  const { data, error } = await admin
    .from("payment_links")
    .select("code, amount_cents, status, expires_at")
    .eq("tenant_id", input.tenantId)
    .eq("order_id", input.orderId)
    .order("created_at", { ascending: false });
  if (error) {
    logServerError("payments.listPaymentLinks", error);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    links: ((data ?? []) as Array<{ code: string; amount_cents: number; status: string; expires_at: string }>).map(
      (row) => ({
        code: row.code,
        amountCents: Number(row.amount_cents) || 0,
        status: row.status,
        expiresAt: row.expires_at,
        url: `/pay/${row.code}`,
      }),
    ),
  };
}

export type MarkPaymentLinkPaidDeps = {
  settle?: typeof settleAtDoor;
  /** Tests only: the environment the production refusal reads. */
  env?: PaymentEnv;
};

/**
 * MOCK LINKS ONLY. A `?confirm=mock` on the pay page says the customer paid:
 * COLLECT THE SALE, then close the link.
 *
 * A Stripe link is never settled here: its money arrives through the webhook
 * and `markPaid`, which books the PaymentIntent and closes the link itself
 * (`lib/payments/link-settlement.ts`). Settling a Stripe link from here would
 * record a payment no charge stands behind. Refused on production entirely.
 *
 * D-135: this used to flip `payment_links.status` to `paid` and settle the
 * reservation with no transaction, and stop. The customer read "Paid", the
 * order stayed `draft`, no money row existed, and the till still showed the
 * sale open. The link is one more tender on the order, so it takes the same
 * road Collect › Cash takes (`settleAtDoor` with the reservation the link
 * holds): the money row, the order completion, the admissions, and the
 * reservation closed against that transaction. The link flips to `paid`
 * only after the sale has actually been collected; a settle that fails
 * leaves the link open, so the next confirmation resumes the same key
 * instead of a paid page over an uncollected sale.
 */
export async function markPaymentLinkPaid(
  admin: Admin,
  input: { code: string; tenantId?: string },
  deps: MarkPaymentLinkPaidDeps = {},
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "expired" | "unavailable" }> {
  if (!mockPaymentsAllowed(deps.env)) return { ok: false, reason: "unavailable" };
  const { data, error } = await admin
    .from("payment_links")
    .select("id, tenant_id, order_id, amount_cents, currency, provider, created_by, operation_key, status, expires_at, reservation_id")
    .eq("code", input.code)
    .maybeSingle();
  if (error) {
    logServerError("payments.markPaymentLinkPaid", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as {
    id: string;
    tenant_id: string;
    order_id: string;
    amount_cents: number;
    currency: string | null;
    provider?: string | null;
    created_by: string | null;
    operation_key: string | null;
    status: string;
    expires_at: string;
    reservation_id: string | null;
  };
  if (input.tenantId && row.tenant_id !== input.tenantId) return { ok: false, reason: "not_found" };
  if (row.status === "paid") return { ok: true };
  if (row.provider === "stripe") return { ok: false, reason: "unavailable" };
  if (row.status !== "open" || Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: "expired" };

  const settle = deps.settle ?? settleAtDoor;
  const settled = await settle(
    admin as never,
    {
      tenantId: row.tenant_id,
      orderId: row.order_id,
      actorUserId: row.created_by ?? "payment-link",
      paidVia: "card",
      amountCents: Number(row.amount_cents),
      currency: row.currency ?? "usd",
      // The link's own operation key: a second confirmation of the same
      // link resumes this collection rather than recording a second one.
      idempotencyKey: row.operation_key ?? `paylink:${row.id}`,
      reservationId: row.reservation_id,
    },
    { onOrderPaid: (ctx) => mintAdmissionsForPaidOrder(admin as never, ctx).then(() => undefined) },
  );
  if (!settled.ok) {
    logServerError("payments.markPaymentLinkPaid.settle", `link ${row.id}: ${settled.reason}`);
    return { ok: false, reason: "unavailable" };
  }

  const { error: updErr } = await admin.from("payment_links").update({ status: "paid" }).eq("id", row.id).eq("status", "open");
  if (updErr) {
    logServerError("payments.markPaymentLinkPaid.update", updErr);
    return { ok: false, reason: "unavailable" };
  }
  // Messages v5 / S2: the order chip reads "paid" now that the link closed.
  await syncConversationRecord(admin, { tenantId: row.tenant_id, kind: "order", recordId: row.order_id });
  return { ok: true };
}

/**
 * Take an open payment page down on purpose (MS18: the basket moved under
 * it and the operator chose "take theirs"). Same release the reaper does:
 * the claim on the balance goes back so the new basket can be requested.
 */
export async function cancelPaymentLink(
  admin: Admin,
  input: { tenantId: string; linkId: string },
  deps: { expireSession?: typeof expireCheckoutSession } = {},
): Promise<{ ok: true; already: boolean } | { ok: false; reason: "not_found" | "already_paid" | "unavailable" }> {
  const { data, error } = await admin
    .from("payment_links")
    .select("id, tenant_id, status, reservation_id, order_id")
    .eq("id", input.linkId)
    .maybeSingle();
  if (error) {
    logServerError("payments.cancelPaymentLink", error);
    return { ok: false, reason: "unavailable" };
  }
  const row = data as {
    id: string;
    tenant_id: string;
    status: string;
    reservation_id: string | null;
    order_id: string | null;
  } | null;
  if (!row || row.tenant_id !== input.tenantId) return { ok: false, reason: "not_found" };
  if (row.status === "paid") return { ok: false, reason: "already_paid" };
  if (row.status !== "open") return { ok: true, already: true };
  // THE SESSION DIES FIRST. Handing the balance back while the customer's
  // Checkout page still works lets the same money be requested and taken
  // again. A session that already completed means the customer paid: say so.
  if (row.reservation_id) {
    const killed = await expireBoundSession(admin, row.reservation_id, deps.expireSession ?? expireCheckoutSession);
    if (!killed.ok) return { ok: false, reason: killed.reason === "complete" ? "already_paid" : "unavailable" };
  }
  const { error: updErr } = await admin.from("payment_links").update({ status: "cancelled" }).eq("id", row.id).eq("status", "open");
  if (updErr) {
    logServerError("payments.cancelPaymentLink.update", updErr);
    return { ok: false, reason: "unavailable" };
  }
  if (row.reservation_id && typeof admin.rpc === "function") {
    await admin.rpc("pos_settle_collection_reservation", {
      p_reservation_id: row.reservation_id,
      p_transaction_id: null,
      p_state: "released",
    });
  }
  // Messages v5 / S2: the chip drops "requested" with the link.
  if (row.order_id) {
    await syncConversationRecord(admin, { tenantId: row.tenant_id, kind: "order", recordId: row.order_id });
  }
  return { ok: true, already: false };
}

export async function reapPaymentLinks(admin: Admin, limit = 50): Promise<{ ok: true; expired: number } | { ok: false }> {
  if (typeof admin.rpc !== "function") return { ok: false };
  const { data, error } = await admin.rpc("reap_payment_links", { p_limit: limit });
  if (error) {
    logServerError("payments.reapPaymentLinks", error);
    return { ok: false };
  }
  const reply = (data ?? {}) as { ok?: boolean; expired?: number };
  if (reply.ok !== true) return { ok: false };
  return { ok: true, expired: Number(reply.expired) || 0 };
}
