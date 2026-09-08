/**
 * Settle a pay-at-door held order: record the collection, then complete.
 *
 * Payment recording, allocation (via completeOrder), and admission mint
 * (onOrderPaid) stay separate so a unique admission constraint cannot be
 * mistaken for financial idempotency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { completeOrderForTransaction } from "@/lib/orders/complete-order";
import type { OnOrderPaid } from "@/lib/orders/complete-order";

export type DoorSettleInput = {
  tenantId: string;
  orderId: string;
  actorUserId: string;
  paidVia: "cash" | "card";
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  /** Open POS shift this tender belongs to. Absent when no shift is open. */
  shiftId?: string | null;
  /** What the operator counted into the drawer. Defaults to amountCents. */
  tenderedCents?: number;
};

export type DoorSettleResult =
  | { ok: true; orderId: string; transactionId: string; alreadySettled: boolean }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_held" | "amount" | "unavailable" };

export async function settleAtDoor(
  admin: SupabaseClient,
  input: DoorSettleInput,
  deps: { onOrderPaid?: OnOrderPaid } = {},
): Promise<DoorSettleResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { ok: false, reason: "amount" };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, total_cents, currency")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("orders.settleAtDoor/order", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const row = order as {
    id: string; tenant_id: string; status: string; total_cents: number; currency: string | null;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (row.status === "paid" || row.status === "fulfilled") {
    const { data: existing, error: existingErr } = await admin
      .from("booking_transactions")
      .select("id")
      .eq("order_id", row.id)
      .eq("provider_reference", input.idempotencyKey)
      .maybeSingle();
    if (existingErr) {
      logServerError("orders.settleAtDoor/existing", existingErr);
      return { ok: false, reason: "unavailable" };
    }
    return {
      ok: true,
      orderId: row.id,
      transactionId: (existing as { id?: string } | null)?.id ?? "already-paid",
      alreadySettled: true,
    };
  }
  if (row.status !== "pending_payment" && row.status !== "draft") {
    return { ok: false, reason: "not_held" };
  }

  const { data: prior, error: priorErr } = await admin
    .from("booking_transactions")
    .select("id")
    .eq("order_id", row.id)
    .eq("provider_reference", input.idempotencyKey)
    .maybeSingle();
  if (priorErr) {
    logServerError("orders.settleAtDoor/prior", priorErr);
    return { ok: false, reason: "unavailable" };
  }
  if (prior?.id) {
    const done = await completeOrderForTransaction(admin, prior.id as string, deps);
    if (!done.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, orderId: row.id, transactionId: prior.id as string, alreadySettled: true };
  }

  const { data: inserted, error: insErr } = await admin
    .from("booking_transactions")
    .insert({
      order_id: row.id,
      source_tenant_id: input.tenantId,
      gross_amount_cents: input.amountCents,
      platform_fee_cents: 0,
      net_amount_cents: input.amountCents,
      currency: input.currency || row.currency || "usd",
      provider: "manual",
      provider_reference: input.idempotencyKey,
      status: "paid",
      paid_at: new Date().toISOString(),
      metadata: {
        paid_via: input.paidVia,
        settled_at: "door",
        actor: input.actorUserId,
        ...(input.shiftId ? { shift_id: input.shiftId } : {}),
        tendered_cents: input.tenderedCents ?? input.amountCents,
        change_cents: (input.tenderedCents ?? input.amountCents) - input.amountCents,
      },
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    logServerError("orders.settleAtDoor/insert", insErr ?? new Error("no row"));
    return { ok: false, reason: "unavailable" };
  }

  const settled = await completeOrderForTransaction(admin, inserted.id as string, deps);
  if (!settled.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, orderId: row.id, transactionId: inserted.id as string, alreadySettled: false };
}
