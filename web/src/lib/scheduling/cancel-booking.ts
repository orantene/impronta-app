import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { resolveCancellationWindow } from "@/lib/bookings/cancellation-window";
import { readPolicyOverride } from "@/lib/bookings/policy-overrides";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type CancelBookingReason =
  | "not_cancellable"
  | "policy_keeps"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "invalid"
  | "unavailable";

export type CancelBookingResult =
  | { ok: true; bookingId: string; refundableCents: number; already?: boolean }
  | { ok: false; reason: CancelBookingReason };

export function refundableCentsFromPolicy(input: {
  paidCents: number;
  cancelFreeHours: number | null;
  startsAt: string | null;
  nowMs: number;
}): number {
  const paid = Math.max(0, Math.trunc(input.paidCents));
  const window = resolveCancellationWindow({
    cancellationHours: input.cancelFreeHours,
    startsAt: input.startsAt,
    eventDate: null,
    nowMs: input.nowMs,
  });
  if (!window.enforceable) return paid;
  if (window.insideWindow) return 0;
  return paid;
}

export async function cancelBookingSet(
  admin: Admin,
  input: {
    tenantId: string;
    bookingId: string;
    operationKey: string;
    reason: string;
    by: "staff" | "customer";
    nowMs?: number;
  },
): Promise<CancelBookingResult> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };

  const { data: booking, error: loadErr } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, offering_id, starts_at, order_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loadErr) {
    logServerError("scheduling.cancelBookingSet.load", loadErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!booking) return { ok: false, reason: "not_found" };
  const b = booking as {
    tenant_id: string;
    offering_id?: string | null;
    starts_at?: string | null;
    order_id?: string | null;
  };
  if (b.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const { data, error } = await admin.rpc("cancel_booking_set", {
    p_tenant_id: input.tenantId,
    p_booking_id: input.bookingId,
    p_operation_key: input.operationKey.trim(),
    p_reason: input.reason,
    p_by: input.by,
  });
  if (error) {
    logServerError("scheduling.cancelBookingSet.rpc", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; already?: boolean; booking_id?: string; order_id?: string };
  if (reply.ok !== true) {
    const reason = reply.reason;
    if (reason === "not_cancellable" || reason === "conflict" || reason === "not_found" || reason === "invalid") {
      return { ok: false, reason };
    }
    return { ok: false, reason: "unavailable" };
  }

  let paidCents = 0;
  const orderId = reply.order_id ?? b.order_id;
  if (orderId) {
    const { data: txns, error: txnErr } = await admin
      .from("booking_transactions")
      .select("gross_amount_cents, status")
      .eq("order_id", orderId);
    if (txnErr) {
      logServerError("scheduling.cancelBookingSet.paid", txnErr);
      return { ok: false, reason: "unavailable" };
    }
    for (const t of (txns ?? []) as Array<{ gross_amount_cents: number; status: string }>) {
      if (t.status === "paid") paidCents += Number(t.gross_amount_cents) || 0;
    }
  }

  let cancelFreeHours: number | null = null;
  if (b.offering_id) {
    const override = await readPolicyOverride(admin, { tenantId: input.tenantId, offeringId: b.offering_id });
    if (override.ok) cancelFreeHours = override.row?.cancelFreeHours ?? null;
  }

  const refundableCents = refundableCentsFromPolicy({
    paidCents,
    cancelFreeHours,
    startsAt: b.starts_at ?? null,
    nowMs: input.nowMs ?? Date.now(),
  });

  return {
    ok: true,
    bookingId: reply.booking_id ?? input.bookingId,
    refundableCents,
    already: reply.already === true,
  };
}
