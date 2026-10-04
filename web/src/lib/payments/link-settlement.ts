import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { syncConversationRecord } from "@/lib/messaging/record-sync";
import { releaseCollectionReservation, reservationIdFromMetadata } from "@/lib/pos/collection-reservations";
import type { Admin } from "@/lib/pos/sale-rows";

/**
 * The payment link a card money row was opened for, stamped on the row next to
 * its reservation and provider request (`collectionMetadata`).
 *
 * WHY THE LINK RIDES ON THE MONEY ROW. A payment link's card payment used to be
 * a Checkout session carrying only `payment_link_code`: no transaction, so the
 * webhook classified it `invalid`, acknowledged it, and the customer was charged
 * while the link and the order stayed unpaid. The link now opens a real
 * `booking_transactions` row first (`openPaymentLinkCheckout`), the session
 * names that row, and the ONE settle path (`markPaid`) is what learns the money
 * landed. `markPaid` has the transaction, not the link, so the link's id travels
 * on the transaction.
 */
export const PAYMENT_LINK_METADATA_KEY = "payment_link_id";

export function paymentLinkIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[PAYMENT_LINK_METADATA_KEY];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

type LinkRow = { id: string; tenant_id: string; order_id: string; status: string };

async function loadLink(admin: Admin, linkId: string): Promise<LinkRow | null | false> {
  const { data, error } = await admin
    .from("payment_links")
    .select("id, tenant_id, order_id, status")
    .eq("id", linkId)
    .maybeSingle();
  if (error) {
    logServerError("payments.linkSettlement.load", error);
    return false;
  }
  return (data as LinkRow | null) ?? null;
}

/**
 * The link's money row is paid: the link reads paid, and the conversation's
 * cards follow.
 *
 * Called from `markPaid` AFTER the order and the reservation have settled, so
 * the link is the last thing to say "paid" and never says it over money that
 * did not land. Idempotent: an already-paid link is left alone and nothing is
 * synced twice.
 *
 * A link that had already closed (the reaper expired it, or the seller
 * cancelled it) while the customer was still on the Checkout page is flipped
 * to paid as well, because the money DID arrive and "expired" over a paid
 * transaction is a lie in the other direction. That case is logged by name: it
 * means a claim was released under a live session, which is the window the
 * session's `expires_at` exists to close.
 */
export async function closePaidPaymentLink(
  admin: Admin,
  input: { linkId: string; transactionId: string },
): Promise<{ ok: true; already: boolean } | { ok: false; reason: "not_found" | "unavailable" }> {
  const link = await loadLink(admin, input.linkId);
  if (link === false) return { ok: false, reason: "unavailable" };
  if (!link) return { ok: false, reason: "not_found" };
  if (link.status === "paid") return { ok: true, already: true };

  const { error } = await admin
    .from("payment_links")
    .update({ status: "paid" })
    .eq("id", link.id)
    .eq("status", link.status);
  if (error) {
    logServerError("payments.linkSettlement.paid", error);
    return { ok: false, reason: "unavailable" };
  }
  if (link.status !== "open") {
    logServerError(
      "payments.linkSettlement.PAID_AFTER_CLOSE",
      `payment link ${link.id} was ${link.status} when transaction ${input.transactionId} settled it; `
        + "the money landed after the link closed. Check the order balance.",
    );
  }
  await syncConversationRecord(admin, { tenantId: link.tenant_id, kind: "order", recordId: link.order_id });
  return { ok: true, already: false };
}

export type ClosedCheckoutDeps = {
  /** `markFailed` from `lib/bookings/transactions`, injected so this module stays below it. */
  markFailed: (transactionId: string, reason: string) => Promise<{ ok: boolean; error?: string }>;
  release?: typeof releaseCollectionReservation;
};

const STILL_PAYABLE = new Set(["payment_requested", "pending"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stripe will never take money on this session again (it expired at the link's
 * own expiry, or a delayed method failed). For a PAYMENT LINK's money row: the
 * row is failed, the balance the link held goes back, and the link reads
 * expired, in that order, so there is no moment where the balance is free while
 * the row still looks payable.
 *
 * Any other transaction is left exactly as it was: POS collections are closed
 * by their own recovery worker, and invoice sessions keep their existing
 * handling. Returns `skipped` for those so the caller can tell.
 */
export async function closePaymentLinkForClosedCheckout(
  admin: Admin,
  input: { transactionId: string; reason: "expired" | "async_payment_failed" },
  deps: ClosedCheckoutDeps,
): Promise<
  | { ok: true; outcome: "expired" | "skipped" | "already_settled" }
  | { ok: false; reason: "unavailable" }
> {
  // Not one of our money rows (the column is a uuid; a foreign id would fail
  // the cast and be retried by Stripe for days).
  if (!UUID_RE.test(input.transactionId)) return { ok: true, outcome: "skipped" };
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, status, metadata")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) {
    logServerError("payments.linkSettlement.closedCheckout.txn", error);
    return { ok: false, reason: "unavailable" };
  }
  const txn = data as { id: string; status: string; metadata: unknown } | null;
  const linkId = txn ? paymentLinkIdFromMetadata(txn.metadata) : null;
  if (!txn || !linkId) return { ok: true, outcome: "skipped" };

  // A row that is not waiting on this session any more (paid by a completed
  // event that raced ahead, already failed by the recovery worker) is not
  // ours to move; the link follows whatever settled it.
  if (!STILL_PAYABLE.has(txn.status)) return { ok: true, outcome: "already_settled" };

  const failed = await deps.markFailed(txn.id, `checkout_${input.reason}`);
  if (!failed.ok) {
    logServerError(
      "payments.linkSettlement.closedCheckout.fail",
      `transaction ${txn.id}: Stripe closed its session (${input.reason}) but the failed transition refused `
        + `(${failed.error ?? "unknown"}); the link stays open until its reaper.`,
    );
    return { ok: false, reason: "unavailable" };
  }

  const reservationId = reservationIdFromMetadata(txn.metadata);
  if (reservationId) {
    const released = await (deps.release ?? releaseCollectionReservation)(admin, reservationId);
    if (!released.ok) {
      logServerError(
        "payments.linkSettlement.closedCheckout.release",
        `transaction ${txn.id}: reservation ${reservationId} did not release; the reaper will free it`,
      );
    }
  }

  const link = await loadLink(admin, linkId);
  if (link && link.status === "open") {
    const { error: expErr } = await admin
      .from("payment_links")
      .update({ status: "expired" })
      .eq("id", link.id)
      .eq("status", "open");
    if (expErr) {
      logServerError("payments.linkSettlement.closedCheckout.expire", expErr);
      return { ok: false, reason: "unavailable" };
    }
    await syncConversationRecord(admin, { tenantId: link.tenant_id, kind: "order", recordId: link.order_id });
  }
  return { ok: true, outcome: "expired" };
}
