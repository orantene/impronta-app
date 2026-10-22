import "server-only";

/**
 * TUL-1838: cancel an open visit with no charge.
 *
 * A table was opened by mistake, or the party left before ordering anything
 * that was kept. `closeVisit` refuses while an unpaid check holds money
 * ("Collect or cancel the check first") and the floor had no way to do the
 * second half. This voids every unpaid order on the visit (draft or awaiting
 * payment, through the same `finalizeOrCancel` the till uses, so held places
 * go back on sale and the kitchen ticket is withdrawn) and then closes the
 * visit through `closeVisit`, so the table gets the same "needs reset" mark.
 *
 * REFUSES, never bends, when any money has been taken or asked for: an order
 * that is not draft / awaiting payment / already cancelled, or any payment
 * row that is paid or requested, means the visit has a charge and must be
 * settled or refunded the money way instead.
 *
 * Idempotent on retry: orders already cancelled are skipped, so a first run
 * that voided some orders and failed on the close can be run again.
 */

import { logServerError } from "@/lib/server/safe-error";
import { finalizeOrCancel } from "@/lib/pos/finalize";
import { closeVisit } from "./commands";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as closeVisit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type CancelVisitResult =
  | { ok: true; visitId: string; spaceId: string; voidedOrders: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_tenant"
        | "already_closed"
        | "has_payment"
        | "version_conflict"
        | "unavailable";
    };

const VOIDABLE = new Set(["draft", "pending_payment"]);

export async function cancelVisitNoCharge(
  admin: Admin,
  input: { tenantId: string; visitId: string; expectedVersion?: number },
): Promise<CancelVisitResult> {
  const { data: visit, error } = await admin
    .from("visits")
    .select("id, tenant_id, status, version, space_id")
    .eq("id", input.visitId)
    .maybeSingle();
  if (error) {
    logServerError("visits.cancelVisit.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!visit) return { ok: false, reason: "not_found" };
  const row = visit as { id: string; tenant_id: string; status: string; version: number; space_id: string };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (row.status !== "open") return { ok: false, reason: "already_closed" };
  if (input.expectedVersion != null && input.expectedVersion !== row.version) {
    return { ok: false, reason: "version_conflict" };
  }

  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select("id, status")
    .eq("visit_id", input.visitId)
    .eq("tenant_id", input.tenantId);
  if (orderError) {
    logServerError("visits.cancelVisit.orders", orderError);
    return { ok: false, reason: "unavailable" };
  }
  const orderRows = (Array.isArray(orders) ? orders : orders ? [orders] : []) as Array<{ id: string; status: string }>;
  // Any order past "awaiting payment" (paid, partly paid, confirmed...) is a charge.
  if (orderRows.some((o) => o.status !== "cancelled" && !VOIDABLE.has(o.status))) {
    return { ok: false, reason: "has_payment" };
  }
  const toVoid = orderRows.filter((o) => VOIDABLE.has(o.status));
  if (toVoid.length > 0) {
    const { data: payments, error: payError } = await admin
      .from("booking_transactions")
      .select("id, status")
      .in("order_id", toVoid.map((o) => o.id))
      .in("status", ["paid", "payment_requested"]);
    if (payError) {
      logServerError("visits.cancelVisit.payments", payError);
      return { ok: false, reason: "unavailable" };
    }
    if (Array.isArray(payments) ? payments.length > 0 : Boolean(payments)) {
      return { ok: false, reason: "has_payment" };
    }
  }

  for (const o of toVoid) {
    const voided = await finalizeOrCancel(admin, { tenantId: input.tenantId, orderId: o.id });
    if (!voided.ok) {
      logServerError("visits.cancelVisit.void", new Error(voided.reason));
      // A sale that moved to paid between the read and the void is a charge now.
      return { ok: false, reason: voided.reason === "not_open" ? "has_payment" : "unavailable" };
    }
  }

  const closed = await closeVisit(admin, {
    tenantId: input.tenantId,
    visitId: input.visitId,
    // Voiding orders does not touch the visit row, so the version the staff saw still holds.
    expectedVersion: input.expectedVersion,
  });
  if (!closed.ok) {
    return { ok: false, reason: closed.reason === "outstanding" ? "unavailable" : closed.reason };
  }
  return { ok: true, visitId: input.visitId, spaceId: row.space_id, voidedOrders: toVoid.length };
}
