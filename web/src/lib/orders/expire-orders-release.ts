/**
 * Give back the stock of orders the expiry sweep just cancelled (TUL-1313).
 *
 * A pay-in-person order commits its units at creation (`keepsStockUntilVisit`).
 * Committed allocations never lapse, and cancelling the ORDER moved nothing, so
 * a no-show menu order kept its stock for ever. After the sweep cancels an
 * order, every allocation still live on its lines is released through the same
 * idempotent RPC every other release uses (a second call frees nothing more).
 *
 * Best effort and never fatal: the order is already cancelled, and the next
 * sweep cannot retry it (it is no longer pending), so a failure is logged
 * loudly instead of being swallowed.
 */
import { logServerError } from "@/lib/server/safe-error";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

const CHUNK = 200;

export async function releaseCancelledOrderStock(admin: Client, orderIds: readonly string[]): Promise<number> {
  if (orderIds.length === 0 || typeof admin.rpc !== "function") return 0;
  let released = 0;
  try {
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const { data: lines, error: lineErr } = await admin.from("order_lines").select("id").in("order_id", orderIds.slice(i, i + CHUNK));
      if (lineErr) {
        logServerError("expire-orders.release.lines", lineErr);
        continue;
      }
      const lineIds = ((lines ?? []) as Array<{ id?: string }>).map((l) => l.id).filter((id): id is string => typeof id === "string");
      if (lineIds.length === 0) continue;
      const { data: allocs, error: allocErr } = await admin
        .from("capacity_allocations")
        .select("id")
        .in("order_line_id", lineIds)
        .neq("state", "released");
      if (allocErr) {
        logServerError("expire-orders.release.allocations", allocErr);
        continue;
      }
      const ids = ((allocs ?? []) as Array<{ id?: string }>).map((a) => a.id).filter((id): id is string => typeof id === "string");
      if (ids.length === 0) continue;
      const { data, error } = await admin.rpc("release_capacity", { p_allocation_ids: ids });
      if (error) {
        logServerError("expire-orders.release.rpc", error);
        continue;
      }
      released += Number((data as { released?: number } | null)?.released ?? 0);
    }
  } catch (err) {
    logServerError("expire-orders.release", err);
  }
  return released;
}
