import "server-only";

/**
 * Cancelling a POS sale, and giving back what it was holding.
 *
 * SPLIT OUT OF `collection.ts`, which is about taking money. This is the other
 * end of the same screen: nothing was collected, the sale is closed, and the
 * places it held go back on sale. It moved because the collection file passed
 * its 800 line budget when the overcollection guard landed, and the honest
 * answer to a budget is to move the thing that did not belong rather than to
 * raise the number.
 *
 * `collection.ts` re-exports both names, so no caller changed.
 */

import { logServerError } from "@/lib/server/safe-error";
import { releaseCapacity } from "@/lib/capacity";
import { cancelTicket, loadActiveTicketForOrder } from "@/lib/preparation/tickets";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type FinalizeResult =
  | { ok: true; orderId: string; status: "cancelled"; releasedAllocationIds: string[] }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_open" | "unavailable" | "conflict"; error: string };

/**
 * A cancelled sale's food is not to be made.
 *
 * `cancelTicket` existed and was called from nowhere: cancelling a sale
 * released the places it held and left its preparation ticket queued (or
 * acknowledged) on the station board, where a cook would make it. Seen on the
 * QA host: six acknowledged "House pizza" tickets for six cancelled sales.
 *
 * Best-effort, AFTER the sale is cancelled: the sale being closed is the fact
 * a cashier is told; a ticket that could not be withdrawn is logged, not
 * turned into "could not cancel the sale", which would leave money owed on a
 * sale that has ended.
 */
async function withdrawTicket(admin: Admin, tenantId: string, orderId: string): Promise<void> {
  const active = await loadActiveTicketForOrder(admin, { tenantId, orderId });
  if (!active.ok) {
    logServerError("pos.finalizeOrCancel.ticket.load", new Error(active.reason));
    return;
  }
  if (!active.ticket) return;
  const cancelled = await cancelTicket(admin, { tenantId, ticketId: active.ticket.id });
  if (!cancelled.ok && cancelled.reason !== "invalid_state") {
    logServerError("pos.finalizeOrCancel.ticket.cancel", new Error(cancelled.reason));
  }
}

export async function finalizeOrCancel(
  admin: Admin,
  input: { tenantId: string; orderId: string; expectedVersion?: number },
  deps: { release?: typeof releaseCapacity } = {},
): Promise<FinalizeResult> {
  if (typeof admin.rpc === "function") {
    const { data, error } = await admin.rpc("pos_cancel_draft", {
      p_tenant_id: input.tenantId,
      p_order_id: input.orderId,
      p_expected_version: input.expectedVersion ?? null,
    });
    if (error) {
      logServerError("pos.finalizeOrCancel.rpc", error);
      return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
    }
    const reply = (data ?? {}) as {
      ok?: boolean;
      reason?: string;
      order_id?: string;
      released_allocation_ids?: string[];
    };
    if (reply.ok !== true) {
      const reason =
        reply.reason === "not_found" ||
        reply.reason === "wrong_tenant" ||
        reply.reason === "not_open" ||
        reply.reason === "conflict"
          ? reply.reason
          : "unavailable";
      return { ok: false, reason, error: "Could not cancel the sale." };
    }
    await withdrawTicket(admin, input.tenantId, reply.order_id ?? input.orderId);
    return {
      ok: true,
      orderId: reply.order_id ?? input.orderId,
      status: "cancelled",
      releasedAllocationIds: reply.released_allocation_ids ?? [],
    };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as { id: string; tenant_id: string; status: string; version: number };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (row.status !== "draft" && row.status !== "pending_payment") {
    return { ok: false, reason: "not_open", error: "This sale cannot be cancelled." };
  }
  if (input.expectedVersion != null && Number(row.version) !== input.expectedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  const { data: cancelled, error: uErr } = await admin
    .from("orders")
    .update({ status: "cancelled", version: Number(row.version) + 1 })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .in("status", ["draft", "pending_payment"])
    .eq("version", row.version)
    .select("id")
    .maybeSingle();
  if (uErr) {
    logServerError("pos.finalizeOrCancel", uErr);
    return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
  }
  if (!cancelled) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }

  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("id")
    .eq("order_id", row.id)
    .eq("tenant_id", input.tenantId);
  if (lineErr) {
    logServerError("pos.finalizeOrCancel.lines", lineErr);
    return { ok: false, reason: "unavailable", error: "Could not release the held places." };
  }
  const lineIds = ((lineRows ?? []) as Array<{ id: string }>).map((l) => l.id);
  let releasedAllocationIds: string[] = [];
  if (lineIds.length > 0) {
    const { data: allocRows, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id, released_at")
      .eq("tenant_id", input.tenantId)
      .in("order_line_id", lineIds);
    if (allocErr) {
      logServerError("pos.finalizeOrCancel.allocations", allocErr);
      return { ok: false, reason: "unavailable", error: "Could not release the held places." };
    }
    const live = ((allocRows ?? []) as Array<{ id: string; released_at: string | null }>).filter(
      (a) => !a.released_at,
    );
    releasedAllocationIds = live.map((a) => a.id);
    if (releasedAllocationIds.length > 0) {
      const release = deps.release ?? releaseCapacity;
      const released = await release(releasedAllocationIds, admin as never);
      if (!released.ok) {
        return { ok: false, reason: "unavailable", error: "Could not release the held places." };
      }
    }
  }
  await withdrawTicket(admin, input.tenantId, row.id);
  return { ok: true, orderId: row.id, status: "cancelled", releasedAllocationIds };
}
