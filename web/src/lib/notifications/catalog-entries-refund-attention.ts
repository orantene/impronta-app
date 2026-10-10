import "server-only";

import type { CatalogEntry } from "./types";
import { str, workspaceAdmins } from "./catalog-audiences";
import { formatFailedRefundMoney } from "@/lib/payments/failed-refund-attention-note";

/** Local, as in catalog-entries-billing: a 3-line coercion is not worth a
 *  shared import, and duplicating it keeps this module self-contained. */
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Zero-decimal-aware money for in-app copy (TUL-375 / review #4). */
function moneyLabel(amountCents: number | null, currency: string | null): string {
  if (amountCents == null || !currency) return "";
  return formatFailedRefundMoney(amountCents, currency);
}

/**
 * TUL-391 money-attention catalog entries.
 *
 * Split out of `catalog-entries-billing.ts` rather than raising that file's
 * 800-line cap: these are in-app-only workspace bells for failed refunds and
 * stamped payment attention — not receipt/billing emails. Extraction keeps
 * the cap honest (same sibling convention as `catalog-entries-disputes.ts`).
 */

/**
 * refund.failed → workspace owners/admins (TUL-391). Stripe returned the refund
 * as failed/canceled; the customer was not paid. In-app only — the webhook log
 * stays the ops trail; the bell opens Admin → Payments → Refunds.
 */
export const REFUND_FAILED_WORKSPACE: CatalogEntry = {
  id: "refund.failed.workspace",
  category: "payments",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["refund.failed"],
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "payment",
    surface: "workspace",
    title: () => "Refund failed",
    body: (event) => {
      const amount = moneyLabel(num(event.payload.amountCents), str(event.payload.currency));
      const reason = str(event.payload.failureReason);
      if (amount && reason) {
        return `${amount} refund failed (${reason}). The customer was not paid — arrange an alternative refund.`;
      }
      if (amount) {
        return `${amount} refund failed. The customer was not paid — arrange an alternative refund.`;
      }
      return "A refund failed. The customer was not paid — arrange an alternative refund.";
    },
    targetDrawer: "workspace-payments",
  },
};

/**
 * payment.needs_attention → workspace owners/admins (TUL-391). Fired when a
 * booking_transactions row is stamped for a human (paid after cancellation,
 * refund_failed, …). Opens the same Money Refunds desk.
 */
export const PAYMENT_NEEDS_ATTENTION_WORKSPACE: CatalogEntry = {
  id: "payment.needs_attention.workspace",
  category: "payments",
  defaultChannels: ["in_app"],
  required: false,
  triggers: ["payment.needs_attention"],
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "payment",
    surface: "workspace",
    title: (event) => {
      const reason = str(event.payload.reason);
      if (reason === "refund_failed") return "Refund needs attention";
      if (reason === "paid_after_cancellation") return "Payment needs a refund";
      return "Payment needs attention";
    },
    body: (event) => {
      const note = str(event.payload.note);
      if (note) return note;
      const reason = str(event.payload.reason);
      if (reason === "paid_after_cancellation") {
        return "A payment landed after the booking was cancelled. Refund it from Money.";
      }
      if (reason === "refund_failed") {
        return "A Stripe refund did not reach the customer. Arrange an alternative refund from Money.";
      }
      return "Open Money to review this payment.";
    },
    targetDrawer: "workspace-payments",
  },
};
