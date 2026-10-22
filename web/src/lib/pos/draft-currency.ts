import "server-only";

/**
 * TUL-1875: an order carries the currency of what it sells. The counter opens
 * every draft as USD, so an MXN item used to be recorded (and charged) as USD.
 * An empty counter cart adopts its first item's currency; a cart that already
 * has lines refuses an item in another currency, so one order never mixes two.
 * Items owned by a talent keep the old rule: refused when they differ.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type OrderCurrencyResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable"; error: string };

export async function settleOrderCurrency(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    orderCurrency: string | null | undefined;
    lineCount: number;
    offeringCurrency: string | null | undefined;
    talentOwned: boolean;
  },
): Promise<OrderCurrencyResult> {
  const offering = (input.offeringCurrency || "USD").toUpperCase();
  const order = (input.orderCurrency || "USD").toUpperCase();
  if (offering === order) return { ok: true };
  if (input.talentOwned || input.lineCount > 0) {
    return { ok: false, reason: "invalid", error: "That price is in a different currency than this sale." };
  }
  const { error } = await admin
    .from("orders")
    .update({ currency: offering })
    .eq("id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "draft");
  if (error) {
    logServerError("pos.addLine.currency", error);
    return { ok: false, reason: "unavailable", error: "Could not set the sale currency." };
  }
  return { ok: true };
}
