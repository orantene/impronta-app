import "server-only";

/**
 * TUL-1349: payment-time re-check. An item switched off for the counter, or
 * unpublished, AFTER it went into a held sale must not take money. Runs at the
 * start of every collection (cash, card, split) before anything is claimed or
 * written. Fails CLOSED: if a read errors the sale is refused, never collected.
 */

import { logServerError } from "@/lib/server/safe-error";
import { isMissingColumnError } from "./pos-enabled";
import { ITEM_UNAVAILABLE, isStaffChannel, offeringSellableAtReprice } from "./reprice-guards";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type RecheckResult =
  | { ok: true }
  | { ok: false; reason: "item_unavailable" | "unavailable"; error: string };

const COULD_NOT_READ = { ok: false as const, reason: "unavailable" as const, error: "Could not check the items on this sale." };

export async function recheckLinesSellable(admin: Admin, tenantId: string, orderId: string): Promise<RecheckResult> {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("source_channel")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    logServerError("pos.recheck.order", orderErr ?? "order missing");
    return COULD_NOT_READ;
  }
  const channel = (order as { source_channel?: string | null }).source_channel ?? null;

  const { data: lineRows, error: lineErr } = await admin.from("order_lines").select("offering_id").eq("order_id", orderId);
  if (lineErr || !Array.isArray(lineRows)) {
    logServerError("pos.recheck.lines", lineErr ?? "lines unreadable");
    return COULD_NOT_READ;
  }
  const ids = [...new Set((lineRows as Array<{ offering_id: string | null }>).map((l) => l.offering_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return { ok: true };

  const read = (cols: string) =>
    admin.from("talent_offerings").select(cols).eq("tenant_id", tenantId).in("id", ids);
  let res = await read("id, status, visibility, moderation_state, pos_enabled");
  // The held migration may not be applied: retry without the column. Any other error fails closed.
  if (res.error && isMissingColumnError(res.error)) res = await read("id, status, visibility, moderation_state");
  if (res.error || !Array.isArray(res.data)) {
    logServerError("pos.recheck.offerings", res.error ?? "offerings unreadable");
    return COULD_NOT_READ;
  }
  const byId = new Map((res.data as Array<Record<string, unknown>>).map((o) => [String(o.id), o]));
  for (const id of ids) {
    const o = byId.get(id);
    if (!o) return ITEM_UNAVAILABLE;
    if (!offeringSellableAtReprice(o, channel)) return ITEM_UNAVAILABLE;
    if (isStaffChannel(channel) && o.pos_enabled === false) return ITEM_UNAVAILABLE;
  }
  return { ok: true };
}
