import "server-only";

import * as React from "react";
import ClientPaymentReceipt from "../../../emails/client/PaymentReceipt";
import ClientDepositReceived from "../../../emails/client/DepositReceived";
import WorkspacePaymentReceived from "../../../emails/workspace/PaymentReceived";
import BillingPaymentFailed from "../../../emails/billing/PaymentFailed";
import TalentPayoutSettled from "../../../emails/talent/PayoutSettled";
import BillingPlanUpgraded from "../../../emails/billing/PlanUpgraded";
import BillingSubscriptionCanceled from "../../../emails/billing/SubscriptionCanceled";
import type { CatalogEntry } from "./types";
import {
  loadInquiryView,
  payoutReceiverTalent,
  str,
  transactionPayer,
  workspaceAdmins,
  workspaceOwner,
} from "./catalog-audiences";
import { formatDateLabel, formatMoneyCents, pageUrl, planLabel } from "./catalog-render";

/**
 * Stripe payment + billing catalog entries (spec §6.5 / §6.6, Slice 15.4) —
 * split out of `catalog.ts` to keep that file under the 800-line cap (the same
 * sibling-extraction convention `catalog-entries-inquiry.ts` uses).
 *
 * Unlike the inquiry entries (email-only, because the engine's `notifyUsers`
 * already fans out their in-app bell), every entry here is DIRECTLY DISPATCHED
 * — from `markPaid` / `markPayoutSent` (booking transactions), the self-serve
 * `cancelSubscription` action, and the Stripe `syncStripeSubscriptionToDb`
 * webhook sync. There is no engine in-app emit on these paths, so the entries
 * own BOTH channels (email + in_app) with no double-notify, exactly per the
 * spec's channel column.
 *
 * Category split drives mutability (spec §6): the four `payment.*` entries are
 * the non-required `payments` category (the owner can opt out, so they carry an
 * unsubscribe footer), while the three `workspace.*` entries are the REQUIRED
 * `billing` category (plan/cancellation receipts can't be turned off, so the
 * dispatcher passes no `unsubscribeUrl` and the templates render no footer).
 */

/** Coerce an unknown payload value to a finite number, else null. */
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

// ─── §6.5 payments ─────────────────────────────────────────────────────────────

/** payment.received → client receipt (email-only). */
const PAYMENT_RECEIVED_CLIENT: CatalogEntry = {
  id: "payment.received.client",
  category: "payments",
  defaultChannels: ["email"],
  required: false,
  triggers: ["payment.received"],
  hydrate: loadInquiryView,
  // 6.3 deposits: a deposit gets the dedicated deposit_received email instead of
  // this generic receipt (so the client gets exactly one, balance-aware email).
  resolveAudience: (event) =>
    str(event.payload.checkoutType) === "deposit" ? Promise.resolve([]) : transactionPayer(event),
  email: {
    templateId: "client.payment_receipt",
    subject: () => "Payment received",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const bookingId = str(event.payload.bookingId);
      return React.createElement(ClientPaymentReceipt, {
        clientName: recipient.displayName,
        contactName: str(event.payload.contactName),
        amountPaid: formatMoneyCents(num(event.payload.grossAmountCents), str(event.payload.currency)),
        paymentDate: formatDateLabel(str(event.payload.paidAt)) ?? "",
        receiptUrl: pageUrl(
          brand,
          bookingId ? `/client/bookings/${bookingId}?tab=payment` : "/client/bookings",
        ),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      });
    },
  },
};

/** payment.received → workspace owners/admins (email + in_app). */
const PAYMENT_RECEIVED_WORKSPACE: CatalogEntry = {
  id: "payment.received.workspace",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.received"],
  hydrate: loadInquiryView,
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "payment",
    surface: "workspace",
    title: () => "Payment received",
    body: (event) => {
      const amount = formatMoneyCents(num(event.payload.grossAmountCents), str(event.payload.currency));
      const contact = str(event.payload.contactName);
      if (amount && contact) return `A payment of ${amount} for ${contact} has been received.`;
      if (amount) return `A payment of ${amount} has been received.`;
      return "A payment has been received.";
    },
  },
  email: {
    templateId: "workspace.payment_received",
    subject: () => "Payment received",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const inquiryId = event.inquiryId ?? str(event.payload.inquiryId);
      return React.createElement(WorkspacePaymentReceived, {
        recipientName: recipient.displayName,
        contactName: str(event.payload.contactName),
        amountReceived: formatMoneyCents(num(event.payload.grossAmountCents), str(event.payload.currency)),
        inquiryUrl: pageUrl(brand, inquiryId ? `/admin/work/${inquiryId}` : "/admin/account"),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      });
    },
  },
};

/**
 * payment.deposit_received → client deposit confirmation (email-only). 6.3
 * deposits: fired alongside payment.received (whose client receipt is suppressed
 * for deposits) so the client gets one balance-aware email. Hydrates the offer
 * total to compute the remaining balance; degrades gracefully if it's unknown.
 */
const PAYMENT_DEPOSIT_RECEIVED_CLIENT: CatalogEntry = {
  id: "payment.deposit_received.client",
  category: "payments",
  defaultChannels: ["email"],
  required: false,
  triggers: ["payment.deposit_received"],
  hydrate: loadInquiryView,
  resolveAudience: transactionPayer,
  email: {
    templateId: "client.deposit_received",
    subject: () => "Deposit received — balance due",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const bookingId = str(event.payload.bookingId);
      const depositCents = num(event.payload.depositAmountCents);
      const currency = str(event.payload.currency);
      // loadInquiryView hydrates offerTotal as "<currency> <amount>" (amount is a
      // plain decimal, not cents); parse the trailing number to derive the balance.
      let balanceDue: string | null = null;
      const offerTotal = str(event.payload.offerTotal);
      if (offerTotal && depositCents != null) {
        const m = offerTotal.match(/([\d.,]+)\s*$/);
        const totalNum = m ? Number(m[1].replace(/,/g, "")) : NaN;
        if (Number.isFinite(totalNum)) {
          const balanceCents = Math.round(totalNum * 100) - depositCents;
          if (balanceCents > 0) balanceDue = formatMoneyCents(balanceCents, currency);
        }
      }
      return React.createElement(ClientDepositReceived, {
        clientName: recipient.displayName,
        contactName: str(event.payload.contactName),
        depositPaid: formatMoneyCents(depositCents, currency),
        balanceDue,
        paymentDate: formatDateLabel(str(event.payload.paidAt)) ?? "",
        payBalanceUrl: pageUrl(
          brand,
          bookingId ? `/client/bookings/${bookingId}?tab=payment` : "/client/bookings",
        ),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      });
    },
  },
};

/** payment.failed → workspace owners/admins, dunning alert (email + in_app). */
const PAYMENT_FAILED_WORKSPACE: CatalogEntry = {
  id: "payment.failed.workspace",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.failed"],
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "payment",
    surface: "workspace",
    title: () => "Payment failed",
    body: (event) => {
      const amount = formatMoneyCents(num(event.payload.amountDueCents), str(event.payload.currency));
      return amount
        ? `We couldn't process your ${amount} payment. Update your payment method to avoid interruption.`
        : "We couldn't process your latest payment. Update your payment method to avoid interruption.";
    },
  },
  email: {
    templateId: "workspace.payment_failed",
    subject: () => "Payment failed — action needed",
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(BillingPaymentFailed, {
        agencyName: str(event.payload.workspaceName) ?? brand.accountName,
        amountDue: formatMoneyCents(num(event.payload.amountDueCents), str(event.payload.currency)),
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      }),
  },
};

/** payment.payout_settled → the talent who was paid (email + in_app). */
const PAYMENT_PAYOUT_SETTLED_TALENT: CatalogEntry = {
  id: "payment.payout_settled.talent",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.payout_settled"],
  hydrate: loadInquiryView,
  resolveAudience: payoutReceiverTalent,
  in_app: {
    kind: "payment",
    surface: "talent",
    title: () => "Your payout is on its way",
    body: (event) => {
      const amount = formatMoneyCents(num(event.payload.netAmountCents), str(event.payload.currency));
      const contact = str(event.payload.contactName);
      if (amount && contact) return `${amount} for ${contact} has been settled to your account.`;
      if (amount) return `${amount} has been settled to your account.`;
      return "Your payout has been settled.";
    },
  },
  email: {
    templateId: "talent.payout_settled",
    subject: () => "Your payout is on its way",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentPayoutSettled, {
        talentName: recipient.displayName,
        contactName: str(event.payload.contactName),
        amountSettled: formatMoneyCents(num(event.payload.netAmountCents), str(event.payload.currency)),
        payoutsUrl: pageUrl(brand, "/talent/settings/payouts"),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      }),
  },
};

// ─── §6.6 billing (REQUIRED — no opt-out, no unsubscribe footer) ───────────────

/** workspace.plan_upgraded → owner (email + in_app). */
const WORKSPACE_PLAN_UPGRADED: CatalogEntry = {
  id: "workspace.plan_upgraded",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["workspace.plan_upgraded"],
  resolveAudience: workspaceOwner,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: (event) => {
      const to = planLabel(str(event.payload.toPlan));
      return to ? `You're on ${to}` : "Your plan was upgraded";
    },
    body: (event) => {
      const to = planLabel(str(event.payload.toPlan));
      const ws = str(event.payload.workspaceName) ?? "Your workspace";
      return to
        ? `${ws} upgraded to ${to}. Your new features are active immediately.`
        : `${ws} was upgraded.`;
    },
  },
  email: {
    templateId: "billing.plan_upgraded",
    subject: (event) => {
      const to = planLabel(str(event.payload.toPlan));
      return to ? `You're now on ${to}` : "Your plan was upgraded";
    },
    render: ({ event, brand }) =>
      React.createElement(BillingPlanUpgraded, {
        agencyName: str(event.payload.workspaceName) ?? brand.accountName,
        toPlan: planLabel(str(event.payload.toPlan)),
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
      }),
  },
};

/** workspace.plan_downgraded → owner (email + in_app). Reuses SubscriptionCanceled (isFullCancel=false). */
const WORKSPACE_PLAN_DOWNGRADED: CatalogEntry = {
  id: "workspace.plan_downgraded",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["workspace.plan_downgraded"],
  resolveAudience: workspaceOwner,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: (event) => {
      const to = planLabel(str(event.payload.toPlan));
      return to ? `Plan changed to ${to}` : "Your plan changed";
    },
    body: (event) => {
      const from = planLabel(str(event.payload.fromPlan));
      const to = planLabel(str(event.payload.toPlan));
      const ws = str(event.payload.workspaceName) ?? "Your workspace";
      if (from && to) return `${ws} moved from ${from} to ${to}.`;
      if (to) return `${ws} moved to ${to}.`;
      return `${ws}'s plan changed.`;
    },
  },
  email: {
    templateId: "billing.plan_downgraded",
    subject: () => "Your plan has changed",
    render: ({ event, brand }) =>
      React.createElement(BillingSubscriptionCanceled, {
        agencyName: str(event.payload.workspaceName) ?? brand.accountName,
        fromPlan: planLabel(str(event.payload.fromPlan)),
        toPlan: planLabel(str(event.payload.toPlan)),
        effectiveLabel: formatDateLabel(str(event.payload.effectiveAt)) ?? "now",
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
      }),
  },
};

/** workspace.subscription_cancelled → owner (email-only). SubscriptionCanceled (isFullCancel=true). */
const WORKSPACE_SUBSCRIPTION_CANCELLED: CatalogEntry = {
  id: "workspace.subscription_cancelled",
  category: "billing",
  defaultChannels: ["email"],
  required: true,
  triggers: ["workspace.subscription_cancelled"],
  resolveAudience: workspaceOwner,
  email: {
    templateId: "billing.subscription_cancelled",
    subject: () => "Your subscription is canceled",
    render: ({ event, brand }) =>
      React.createElement(BillingSubscriptionCanceled, {
        agencyName: str(event.payload.workspaceName) ?? brand.accountName,
        fromPlan: planLabel(str(event.payload.fromPlan)),
        toPlan: planLabel(str(event.payload.toPlan)) || "Free",
        effectiveLabel: formatDateLabel(str(event.payload.effectiveAt)) ?? "now",
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
      }),
  },
};

/** The 7 Stripe payment + billing entries, in catalog order. */
export const BILLING_CATALOG_ENTRIES: CatalogEntry[] = [
  PAYMENT_RECEIVED_CLIENT,
  PAYMENT_RECEIVED_WORKSPACE,
  PAYMENT_DEPOSIT_RECEIVED_CLIENT,
  PAYMENT_FAILED_WORKSPACE,
  PAYMENT_PAYOUT_SETTLED_TALENT,
  WORKSPACE_PLAN_UPGRADED,
  WORKSPACE_PLAN_DOWNGRADED,
  WORKSPACE_SUBSCRIPTION_CANCELLED,
];
