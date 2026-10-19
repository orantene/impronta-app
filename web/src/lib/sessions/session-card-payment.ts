/**
 * The ownership check in front of the session picker's card hop.
 *
 * Kept out of `session-picker-actions.ts` on purpose: that is a "use server"
 * file, where every export is a client-callable action, and this takes a
 * service-role client. The action calls it; nothing public does.
 *
 * A guest can send any ids to a server action, so the transaction is only
 * charged when it belongs to the given order AND that order belongs to the
 * given tenant AND is still unpaid AND there is money to collect. Anything else
 * is `not_found`, before Stripe is reached.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Admin = SupabaseClient;

export type SessionCardPaymentLookup =
  | {
      ok: true;
      amountCents: number;
      currency: string;
      receiptCode: string;
      bookingId: string | null;
      inquiryId: string | null;
      customerId: string | null;
      description: string;
    }
  | { ok: false; reason: "not_found" | "engine_error" };

export async function resolveSessionCardPayment(
  admin: Admin,
  d: { tenantId: string; orderId: string; transactionId: string },
): Promise<SessionCardPaymentLookup> {
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, tenant_id, status, receipt_code, currency, customer_id")
    .eq("id", d.orderId)
    .eq("tenant_id", d.tenantId)
    .maybeSingle();
  if (oErr) return { ok: false, reason: "engine_error" };
  const o = order as Row | null;
  if (!o || o.status === "paid") return { ok: false, reason: "not_found" };

  const { data: txn, error: tErr } = await admin
    .from("booking_transactions")
    .select("id, order_id, booking_id, source_inquiry_id, gross_amount_cents, status")
    .eq("id", d.transactionId)
    .eq("order_id", d.orderId)
    .maybeSingle();
  if (tErr) return { ok: false, reason: "engine_error" };
  const x = txn as Row | null;
  if (!x) return { ok: false, reason: "not_found" };
  const amountCents = Number(x.gross_amount_cents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, reason: "not_found" };

  // Best effort, cosmetic: the offering title is the Stripe line description.
  let description = "Session";
  try {
    const { data: line } = await admin.from("order_lines").select("offering_id").eq("order_id", d.orderId).limit(1).maybeSingle();
    const offeringId = (line as Row | null)?.offering_id;
    if (typeof offeringId === "string") {
      const { data: off } = await admin.from("talent_offerings").select("title").eq("id", offeringId).eq("tenant_id", d.tenantId).maybeSingle();
      const title = (off as Row | null)?.title;
      if (typeof title === "string" && title.trim()) description = title.trim();
    }
  } catch {
    /* keep the fallback */
  }

  return {
    ok: true,
    amountCents,
    currency: String(o.currency ?? "USD"),
    receiptCode: String(o.receipt_code ?? ""),
    bookingId: (x.booking_id as string | null) ?? null,
    inquiryId: (x.source_inquiry_id as string | null) ?? null,
    customerId: (o.customer_id as string | null) ?? null,
    description,
  };
}
