import "server-only";

/**
 * P8-01 — hybrid package components (L55 effect 5).
 *
 * One `orders` row is still the commercial record (L52). A birthday package,
 * a retreat day, or a supervised lesson is several lines on that order, each
 * with its own availability. Cancelling catering refunds and releases only
 * that line's capacity; the game slot stays booked.
 *
 * Money still goes through `refundOrderLines`. This module is the resource
 * half the line refund does not do for non-admission components (party rooms,
 * catering windows, stations).
 */

import { logServerError } from "@/lib/server/safe-error";
import { releaseCapacity } from "@/lib/capacity";
import { refundOrderLines } from "@/lib/orders/refund-execute-lines";
import { refundReasonForEffect } from "@/lib/orders/refund-effects";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (...args: any[]) => any;
};

export type CancelHybridResult =
  | {
      ok: true;
      refundedCents: number;
      releasedAllocationIds: string[];
      standingLineIds: string[];
    }
  | {
      ok: false;
      reason: "not_found" | "wrong_tenant" | "unavailable" | "empty" | "not_a_component";
      error: string;
    };

export async function cancelHybridComponents(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    lineIds: readonly string[];
    actorUserId?: string | null;
    note?: string | null;
  },
  deps: {
    refundLines?: typeof refundOrderLines;
    release?: typeof releaseCapacity;
  } = {},
): Promise<CancelHybridResult> {
  if (!input.tenantId || !input.orderId || input.lineIds.length === 0) {
    return { ok: false, reason: "empty", error: "Pick the part of the package to cancel." };
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderErr) {
    logServerError("orders.hybrid.cancel.order", orderErr);
    return { ok: false, reason: "unavailable", error: "Could not cancel that part." };
  }
  if (!order) return { ok: false, reason: "not_found", error: "That order is not here." };
  const orderRow = order as { id: string; tenant_id: string; status: string };
  if (orderRow.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That order is not here." };
  }

  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("id, refunded_cents, total_cents")
    .eq("order_id", input.orderId);
  if (lineErr) {
    logServerError("orders.hybrid.cancel.lines", lineErr);
    return { ok: false, reason: "unavailable", error: "Could not cancel that part." };
  }
  const lines = (lineRows ?? []) as Array<{ id: string; refunded_cents: number | string; total_cents: number | string }>;
  if (lines.length < 2) {
    return {
      ok: false,
      reason: "not_a_component",
      error: "A hybrid cancel needs a package with more than one part.",
    };
  }
  const known = new Set(lines.map((l) => l.id));
  if (input.lineIds.some((id) => !known.has(id))) {
    return { ok: false, reason: "not_found", error: "That part is not on this package." };
  }
  if (input.lineIds.length >= lines.length) {
    return {
      ok: false,
      reason: "not_a_component",
      error: "Cancelling every part is a full refund, not a hybrid-component refund.",
    };
  }

  const refund = deps.refundLines ?? refundOrderLines;
  const money = await refund(admin as never, {
    orderId: input.orderId,
    lineIds: input.lineIds,
    reason: refundReasonForEffect("refund_hybrid_component"),
    actorUserId: input.actorUserId,
    note: input.note ?? "hybrid_component",
  });
  if (!money.ok && money.movedCents === 0) {
    return { ok: false, reason: "unavailable", error: money.reason };
  }

  const { data: allocRows, error: allocErr } = await admin
    .from("capacity_allocations")
    .select("id, order_line_id, released_at")
    .eq("tenant_id", input.tenantId)
    .in("order_line_id", [...input.lineIds]);
  if (allocErr) {
    logServerError("orders.hybrid.cancel.allocations", allocErr);
    return { ok: false, reason: "unavailable", error: "Money moved; capacity still needs a human." };
  }
  const live = ((allocRows ?? []) as Array<{ id: string; released_at: string | null }>).filter(
    (a) => !a.released_at,
  );
  const ids = live.map((a) => a.id);
  const release = deps.release ?? releaseCapacity;
  if (ids.length > 0) {
    await release(ids, admin as never);
  }

  const cancelled = new Set(input.lineIds);
  const standingLineIds = lines.filter((l) => !cancelled.has(l.id)).map((l) => l.id);
  const refundedCents = money.ok ? money.refundedCents : money.movedCents;

  return {
    ok: true,
    refundedCents,
    releasedAllocationIds: ids,
    standingLineIds,
  };
}
