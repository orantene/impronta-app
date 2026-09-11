import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { generateOpaqueCode } from "@/lib/links/code";
import { reserveCollection, reservationTtlSeconds } from "@/lib/pos/collection-reservations";
import type { Admin } from "@/lib/pos/sale-rows";

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
    actorUserId: string;
    publicOrigin: string;
  },
): Promise<CreatePaymentLinkResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, reason: "invalid" };
  if (input.idempotencyKey.trim().length < 8) return { ok: false, reason: "invalid" };

  const { data: existing } = await admin
    .from("payment_links")
    .select("code, amount_cents, expires_at, status")
    .eq("tenant_id", input.tenantId)
    .eq("operation_key", input.idempotencyKey.trim())
    .maybeSingle();
  if (existing) {
    const row = existing as { code: string; amount_cents: number; expires_at: string; status: string };
    if (row.status === "expired" || row.status === "cancelled") return { ok: false, reason: "expired" };
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

  const claimed = await reserveCollection(admin, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    operationKey: input.idempotencyKey.trim(),
    amountCents: input.amountCents,
    method: "link",
    actorUserId: input.actorUserId,
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
  const provider = process.env.STRIPE_SECRET_KEY ? "stripe" : "mock";
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
    created_by: input.actorUserId,
    operation_key: input.idempotencyKey.trim(),
    reservation_id: claimed.reservationId,
  });
  if (insErr) {
    logServerError("payments.createPaymentLink.insert", insErr);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    code,
    url: `${input.publicOrigin.replace(/\/$/, "")}/pay/${code}`,
    amountCents: claimed.amountCents,
    expiresAt,
  };
}

export async function loadPaymentLinkByCode(
  admin: Admin,
  code: string,
): Promise<
  | { ok: true; tenantId: string; orderId: string; amountCents: number; status: string; provider: string; expiresAt: string }
  | { ok: false; reason: "not_found" | "expired" | "unavailable" }
> {
  const { data, error } = await admin
    .from("payment_links")
    .select("tenant_id, order_id, amount_cents, status, provider, expires_at")
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
  };
  if (row.status === "expired" || Date.parse(row.expires_at) <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    amountCents: Number(row.amount_cents),
    status: row.status,
    provider: row.provider,
    expiresAt: row.expires_at,
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

export async function markPaymentLinkPaid(
  admin: Admin,
  input: { code: string; tenantId?: string },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "expired" | "unavailable" }> {
  const { data, error } = await admin
    .from("payment_links")
    .select("id, tenant_id, status, expires_at, reservation_id")
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
    status: string;
    expires_at: string;
    reservation_id: string | null;
  };
  if (input.tenantId && row.tenant_id !== input.tenantId) return { ok: false, reason: "not_found" };
  if (row.status === "paid") return { ok: true };
  if (row.status !== "open" || Date.parse(row.expires_at) <= Date.now()) return { ok: false, reason: "expired" };
  const { error: updErr } = await admin.from("payment_links").update({ status: "paid" }).eq("id", row.id).eq("status", "open");
  if (updErr) {
    logServerError("payments.markPaymentLinkPaid.update", updErr);
    return { ok: false, reason: "unavailable" };
  }
  if (row.reservation_id && typeof admin.rpc === "function") {
    await admin.rpc("pos_settle_collection_reservation", {
      p_reservation_id: row.reservation_id,
      p_transaction_id: null,
      p_state: "settled",
    });
  }
  return { ok: true };
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
