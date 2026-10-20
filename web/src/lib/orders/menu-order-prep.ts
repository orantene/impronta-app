import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { submitOrderToPreparation } from "@/lib/preparation/tickets";
import { logServerError } from "@/lib/server/safe-error";

type Submit = typeof submitOrderToPreparation;

/**
 * TUL-1332 PR 3 — an online menu order reaches the kitchen.
 *
 * POS and the table QR already send their orders to preparation
 * (`submitOrderToPreparation`); the online menu did not, so a business could
 * take an order it never saw on the kitchen board. This sends the placed order
 * as a PICKUP ticket, the same ticket the board already shows and revises.
 *
 * BEST EFFORT, NEVER FATAL: the order is already placed and recorded. A ticket
 * that cannot be written is logged and reported to the caller, never raised, so
 * a kitchen-board outage cannot turn a taken order into a failed one. The ticket
 * is idempotent per order (a repeat revises it), so a retry cannot double it.
 */
export async function fireMenuOrderToKitchen(
  admin: SupabaseClient,
  input: { tenantId: string; orderId: string },
  submit: Submit = submitOrderToPreparation,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const res = await submit(admin, { tenantId: input.tenantId, orderId: input.orderId, destination: "pickup" });
    if (!res.ok) {
      logServerError("menuOrder.kitchenTicket", new Error(`${res.reason}: ${res.error}`));
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    logServerError("menuOrder.kitchenTicket", error);
    return { ok: false };
  }
}
