/**
 * The webhook's inventory restore (TUL-1268 M5, TUL-941), kept out of
 * `refunds.ts` (which only calls it) so that file stays under its size cap.
 * `refunds.ts` runs it after a FULL refund (charge.refunded with the whole
 * charge back) and after a LOST dispute; partial refunds never call it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { restoreAfterChargeFullyRefunded } from "@/lib/orders/refund-restore";
import { syncConversationRecord } from "@/lib/messaging/record-sync";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

export type RestoreInventory = (sb: SupabaseClient, transactionId: string) => Promise<void>;

/**
 * Run the restore at a webhook call site. The money is already booked, so a
 * restore failure is logged and swallowed: a throw would 500 the webhook and
 * make Stripe retry a refund that is already recorded.
 */
export async function runRestoreInventory(
  restore: RestoreInventory,
  sb: SupabaseClient | null,
  transactionId: string,
): Promise<void> {
  if (!sb) return;
  try {
    await restore(sb, transactionId);
  } catch (err) {
    logServerError(`refunds.restoreInventory[txn=${transactionId}]`, err);
  }
}

/**
 * TUL-1268 M5: a FULL refund (charge.refunded with the whole charge back, or a
 * lost dispute) puts back what the order took: tickets refunded, seats and
 * stock released, promo redemption voided. The SAME step the Orders desk runs
 * (`restoreRefundedLines`), so every refund route restores, and restores once:
 * each write is idempotent by identity, so a desk refund followed by its own
 * webhook, or a re-delivered event, changes nothing the second time. Partial
 * refunds never call this (a Stripe refund names an amount, not units).
 */
export async function restoreInventoryAfterFullRefund(sb: SupabaseClient, transactionId: string): Promise<void> {
  try {
    await restoreInventoryAfterFullRefundInner(sb, transactionId);
  } catch (err) {
    logServerError(`refunds.restoreInventory[txn=${transactionId}]`, err);
  }
}

async function restoreInventoryAfterFullRefundInner(sb: SupabaseClient, transactionId: string): Promise<void> {
  const outcome = await restoreAfterChargeFullyRefunded(sb, { transactionId });
  if (!outcome.restored) {
    if (outcome.reason !== "no_order") {
      void improntaLog("stripe_webhook.info", {
        message: `[refund.restore] txn=${transactionId} inventory not restored: ${outcome.reason}`,
      });
    }
    return;
  }
  const r = outcome.result;
  if (r.stampedAdmissionIds.length > 0) {
    // Messages v5 / S2: ticket chips follow the stamp, like the desk path.
    // A failed read only skips the chip sync: the restore itself already landed.
    const { data, error } = await sb.from("orders").select("tenant_id").eq("id", outcome.orderId).maybeSingle();
    if (error) logServerError(`refunds.restoreInventory.orderTenant[order=${outcome.orderId}]`, error);
    const tenantId = error ? null : ((data as { tenant_id?: string | null } | null)?.tenant_id ?? null);
    if (tenantId) {
      for (const admissionId of r.stampedAdmissionIds) {
        await syncConversationRecord(sb, { tenantId, kind: "tickets", recordId: admissionId });
      }
    }
  }
  void improntaLog("stripe_webhook.info", {
    message: `[refund.restore] txn=${transactionId} order=${outcome.orderId} tickets=${r.admissionsStamped} allocations=${r.allocationsReleased} promoVoided=${r.releasedPromoRedemption}${r.admissionsIncomplete ? " INCOMPLETE" : ""}`,
  });
}
