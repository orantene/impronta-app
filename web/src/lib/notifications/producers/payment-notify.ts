import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Stripe payment producers (spec §6.5, Slice 15.4) — fire-and-forget emits from
 * the booking-transaction lifecycle (`markPaid` / `markPayoutSent`) and the
 * Stripe subscription sync. The catalog entries
 * (`catalog-entries-billing.ts`) own BOTH channels (email + in_app) because
 * these paths do NOT route through the engine's `notifyUsers` — there is no
 * separate in-app emit to double up with.
 *
 * Every emit no-ops without RESEND_API_KEY (the dispatcher short-circuits when
 * the service-role client or Resend key is absent), and each carries a stable
 * `eventId` so a retried transition / webhook re-delivery collapses to a single
 * delivery via the `dispatch_log` unique index.
 */

/**
 * `payment.received` — fans out to the client receipt
 * (`payment.received.client`, email-only) and the workspace alert
 * (`payment.received.workspace`, email + in-app). `inquiryId` drives the
 * `loadInquiryView` hydrator (contact name + inquiry deep-link); it may be null
 * for a transaction with no source inquiry, in which case the templates degrade
 * gracefully (the contact row drops out, links fall back to the index page).
 */
export function notifyPaymentReceived(params: {
  transactionId: string;
  tenantId: string;
  inquiryId: string | null;
  bookingId: string;
  payerUserId: string | null;
  payerEmail: string | null;
  grossAmountCents: number;
  currency: string;
  paidAt: string | null;
  /** 6.3 deposits: 'deposit' suppresses the generic client receipt (the
   *  deposit-specific email goes out via notifyDepositReceived instead); the
   *  workspace alert still fires. */
  checkoutType?: "deposit" | "balance" | "full";
}): void {
  void dispatchEventNotifications({
    type: "payment.received",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `payment-received:${params.transactionId}`,
    payload: {
      bookingId: params.bookingId,
      inquiryId: params.inquiryId,
      payerUserId: params.payerUserId,
      payerEmail: params.payerEmail,
      grossAmountCents: params.grossAmountCents,
      currency: params.currency,
      paidAt: params.paidAt,
      checkoutType: params.checkoutType ?? "full",
    },
  }).catch((err) => {
    logServerError("notifyPaymentReceived", err);
  });
}

/**
 * `payment.invoice_issued` — a formal INVOICE to the client on a CONFIRMED
 * (full/balance, non-deposit) payment. Same audience + hydrate as the receipt
 * (transactionPayer + loadInquiryView). This entry is DEFAULT OFF in the console
 * (notification_overlay seeded email_enabled=false) so it never duplicates the
 * `payment.received` receipt unless an admin opts in at /platform/admin/email.
 */
export function notifyInvoiceIssued(params: {
  transactionId: string;
  tenantId: string;
  inquiryId: string | null;
  bookingId: string;
  payerUserId: string | null;
  payerEmail: string | null;
  grossAmountCents: number;
  currency: string;
  paidAt: string | null;
}): void {
  void dispatchEventNotifications({
    type: "payment.invoice_issued",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `invoice-issued:${params.transactionId}`,
    payload: {
      transactionId: params.transactionId,
      bookingId: params.bookingId,
      inquiryId: params.inquiryId,
      payerUserId: params.payerUserId,
      payerEmail: params.payerEmail,
      grossAmountCents: params.grossAmountCents,
      currency: params.currency,
      paidAt: params.paidAt,
    },
  }).catch((err) => {
    logServerError("notifyInvoiceIssued", err);
  });
}

/**
 * `payment.deposit_received` — the client who paid a 6.3 DEPOSIT
 * (`payment.deposit_received.client`, email-only). Distinct from the generic
 * receipt: it confirms the deposit and shows the balance still due, with a CTA
 * to pay it. The generic `payment.received.client` receipt is suppressed for
 * deposits (see the entry's audience guard), so the client gets exactly one
 * email. `loadInquiryView` hydrates the contact name + offer total (→ balance).
 */
export function notifyDepositReceived(params: {
  transactionId: string;
  tenantId: string;
  inquiryId: string | null;
  bookingId: string;
  payerUserId: string | null;
  payerEmail: string | null;
  depositAmountCents: number;
  currency: string;
  paidAt: string | null;
}): void {
  void dispatchEventNotifications({
    type: "payment.deposit_received",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `deposit-received:${params.transactionId}`,
    payload: {
      bookingId: params.bookingId,
      inquiryId: params.inquiryId,
      payerUserId: params.payerUserId,
      payerEmail: params.payerEmail,
      depositAmountCents: params.depositAmountCents,
      currency: params.currency,
      paidAt: params.paidAt,
    },
  }).catch((err) => {
    logServerError("notifyDepositReceived", err);
  });
}

/**
 * `payment.payout_settled` — the talent whose payout was settled
 * (`payment.payout_settled.talent`, email + in-app). `payoutAccountId` is the
 * `payout_accounts.id`; the `payoutReceiverTalent` resolver chains it to the
 * talent's user account. Only call this when the payout receiver is a talent —
 * the resolver returns nothing for agency/admin/coordinator accounts, so a
 * stray call is a harmless no-op, but gating at the call site avoids a wasted
 * dispatch.
 */
export function notifyTalentPayoutSettled(params: {
  transactionId: string;
  tenantId: string;
  inquiryId: string | null;
  bookingId: string;
  payoutAccountId: string;
  netAmountCents: number;
  currency: string;
}): void {
  void dispatchEventNotifications({
    type: "payment.payout_settled",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `payout-settled:${params.transactionId}`,
    payload: {
      bookingId: params.bookingId,
      inquiryId: params.inquiryId,
      payoutAccountId: params.payoutAccountId,
      netAmountCents: params.netAmountCents,
      currency: params.currency,
    },
  }).catch((err) => {
    logServerError("notifyTalentPayoutSettled", err);
  });
}

/**
 * `payment.failed` — workspace dunning alert (`payment.failed.workspace`, email
 * + in-app) when a subscription invoice fails (Stripe `past_due`). `occurredOn`
 * (UTC YYYY-MM-DD) is folded into the `eventId` so a same-day re-sync is a
 * dedupe no-op while a later failure re-nudges. Amount + currency ride the
 * payload so the template can name the shortfall; both may be null (the
 * FieldTable row + in-app amount drop out gracefully).
 */
export function notifyWorkspacePaymentFailed(params: {
  tenantId: string;
  workspaceName: string | null;
  amountDueCents: number | null;
  currency: string | null;
  occurredOn: string;
}): void {
  void dispatchEventNotifications({
    type: "payment.failed",
    tenantId: params.tenantId,
    eventId: `payment-failed:${params.tenantId}:${params.occurredOn}`,
    payload: {
      workspaceName: params.workspaceName,
      amountDueCents: params.amountDueCents,
      currency: params.currency,
    },
  }).catch((err) => {
    logServerError("notifyWorkspacePaymentFailed", err);
  });
}
