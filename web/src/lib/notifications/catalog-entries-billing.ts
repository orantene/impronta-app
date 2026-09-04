import "server-only";

import * as React from "react";
import ClientPaymentReceipt from "../../../emails/client/PaymentReceipt";
import ClientDepositReceived from "../../../emails/client/DepositReceived";
import WorkspacePaymentReceived from "../../../emails/workspace/PaymentReceived";
import BillingPaymentFailed from "../../../emails/billing/PaymentFailed";
import BillingInvoice from "../../../emails/billing/Invoice";
import TalentPayoutSettled from "../../../emails/talent/PayoutSettled";
import TalentPayoutReversed from "../../../emails/talent/PayoutReversed";
import ClientPaymentRefunded from "../../../emails/client/PaymentRefunded";
import BillingPlanUpgraded from "../../../emails/billing/PlanUpgraded";
import BillingSubscriptionCanceled from "../../../emails/billing/SubscriptionCanceled";
import BillingTrialWillEnd from "../../../emails/billing/TrialWillEnd";
import BillingDiscountEnding from "../../../emails/billing/DiscountEnding";
import BillingTrialStarted from "../../../emails/billing/TrialStarted";
import DisputeOpenedAlert from "../../../emails/platform/DisputeOpenedAlert";
import type { CatalogEntry } from "./types";
import {
  invitedTalent,
  loadInquiryView,
  payoutReceiverTalent,
  payoutReversedTalent,
  refundedClient,
  platformAdmins,
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

/** payment.received → client receipt (email + in_app). */
const PAYMENT_RECEIVED_CLIENT: CatalogEntry = {
  id: "payment.received.client",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.received"],
  hydrate: loadInquiryView,
  // 6.3 deposits: a deposit gets the dedicated deposit_received email instead of
  // this generic receipt (so the client gets exactly one, balance-aware email).
  resolveAudience: (event) =>
    str(event.payload.checkoutType) === "deposit" ? Promise.resolve([]) : transactionPayer(event),
  in_app: {
    kind: "payment",
    surface: "client",
    title: () => "Payment received",
    body: (event) => {
      const amount = formatMoneyCents(num(event.payload.grossAmountCents), str(event.payload.currency));
      const contact = str(event.payload.contactName);
      if (amount && contact) return `Your ${amount} payment for ${contact} was received.`;
      if (amount) return `Your ${amount} payment was received.`;
      return "Your payment was received.";
    },
  },
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
/**
 * payment.invoice_issued → client formal invoice (email-only). DEFAULT OFF via a
 * seeded notification_overlay row (email_enabled=false) so it never duplicates
 * the payment.received receipt unless an admin enables it in /platform/admin/email.
 * Fires only on confirmed (full/balance, non-deposit) payments.
 */
const PAYMENT_INVOICE_ISSUED_CLIENT: CatalogEntry = {
  id: "payment.invoice_issued.client",
  category: "payments",
  defaultChannels: ["email"],
  required: false,
  triggers: ["payment.invoice_issued"],
  hydrate: loadInquiryView,
  resolveAudience: transactionPayer,
  email: {
    templateId: "payment.invoice_issued.client",
    subject: () => "Your invoice",
    render: ({ event, recipient: _recipient, brand, unsubscribeUrl }) => {
      const bookingId = str(event.payload.bookingId);
      const txnId = str(event.payload.transactionId) ?? bookingId ?? "";
      const paidAt = str(event.payload.paidAt);
      const year = paidAt ? new Date(paidAt).getFullYear() : new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${txnId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      return React.createElement(BillingInvoice, {
        agencyName: brand.accountName ?? "",
        invoiceNumber,
        amount: formatMoneyCents(num(event.payload.grossAmountCents), str(event.payload.currency)),
        dateLabel: formatDateLabel(paidAt) ?? "",
        invoiceUrl: pageUrl(
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

const PAYMENT_DEPOSIT_RECEIVED_CLIENT: CatalogEntry = {
  id: "payment.deposit_received.client",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.deposit_received"],
  hydrate: loadInquiryView,
  resolveAudience: transactionPayer,
  in_app: {
    kind: "payment",
    surface: "client",
    title: () => "Deposit received",
    body: (event) => {
      const amount = formatMoneyCents(num(event.payload.depositAmountCents), str(event.payload.currency));
      const contact = str(event.payload.contactName);
      if (amount && contact) return `Your ${amount} deposit for ${contact} was received. Balance due before the booking.`;
      if (amount) return `Your ${amount} deposit was received. Balance due before the booking.`;
      return "Your deposit was received. Balance due before the booking.";
    },
  },
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

/**
 * payment.dispute.opened → platform admins, the moment a chargeback is filed.
 *
 * Previously this path wrote a server error log and nothing else: a dispute
 * opened, an external deadline started running, and no human was told unless
 * somebody happened to be reading logs. Dispute CLOSED already notified (the
 * payout reversal), which made the silence on OPEN easy to miss — the noisy
 * half was covered and the time-critical half was not.
 *
 * In-app only for now. Email would need its own template, and shipping the bell
 * alert today beats waiting for one; the deadline is in the body so the alert is
 * actionable on its own.
 */
const PAYMENT_DISPUTE_OPENED_PLATFORM: CatalogEntry = {
  id: "payment.dispute.opened.platform",
  category: "platform_alerts",
  // Was `in_app` only: a chargeback rang one bell and emailed nobody, while the
  // evidence deadline reached `logServerError` and no human surface at all. An
  // unanswered dispute is LOST BY DEFAULT and the amount plus the dispute fee
  // stay withdrawn, so a bell someone may not be looking at is not sufficient.
  defaultChannels: ["in_app", "email"],
  // required=true, unlike the rest of this family. A chargeback carries a hard
  // response deadline set by the card network, and an unanswered dispute is
  // lost by default. A platform admin who once muted the payments category
  // should not thereby opt out of a legal deadline, so this one is
  // unsubscribe-proof in the same way the billing family is.
  required: true,
  triggers: ["payment.dispute.opened"],
  resolveAudience: platformAdmins,
  in_app: {
    kind: "ticket",
    surface: "workspace",
    title: () => "A payment was disputed",
    body: (event) => {
      const due = formatDateLabel(str(event.payload.evidenceDueAt));
      return `${formatMoneyCents(num(event.payload.amountCents), str(event.payload.currency))} disputed (${
        str(event.payload.reason) || "no reason given"
      }). ${due ? `Evidence due ${due}.` : "Stripe has not set an evidence deadline yet."}`;
    },
  },
  email: {
    templateId: "platform.payment_dispute_opened",
    subject: (event) => {
      const due = formatDateLabel(str(event.payload.evidenceDueAt));
      const amount = formatMoneyCents(num(event.payload.amountCents), str(event.payload.currency));
      // The deadline goes in the SUBJECT. It is the only part that decides
      // whether this gets opened today rather than after we have lost by default.
      return due
        ? `Chargeback: ${amount} disputed, evidence due ${due}`
        : `Chargeback: ${amount} disputed`;
    },
    render: ({ event, brand }) =>
      React.createElement(DisputeOpenedAlert, {
        amount: formatMoneyCents(num(event.payload.amountCents), str(event.payload.currency)),
        reason: str(event.payload.reason) || "no reason given",
        dueDate: formatDateLabel(str(event.payload.evidenceDueAt)),
        disputeId: str(event.payload.disputeId) || "unknown",
        stripeUrl: `https://dashboard.stripe.com/disputes/${str(event.payload.disputeId) ?? ""}`,
        brand,
      }),
  },
};

/**
 * payment.payout_reversed → the talent whose payout was clawed back by a lost
 * dispute or a refund (email-only). The in-app bell stays on the reversal
 * producer's emitNotification (keeps its money-drawer deep-link); this entry
 * migrates only the EMAIL onto the dispatcher (suppression + log + unsubscribe).
 */
const PAYMENT_PAYOUT_REVERSED_TALENT: CatalogEntry = {
  id: "payment.payout_reversed.talent",
  category: "payments",
  defaultChannels: ["email"],
  required: false,
  triggers: ["payment.payout_reversed"],
  resolveAudience: payoutReversedTalent,
  email: {
    templateId: "talent.payout_reversed",
    subject: () => "A payout was reversed",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentPayoutReversed, {
        talentName: recipient.displayName,
        amountReversed: formatMoneyCents(num(event.payload.amountCents), str(event.payload.currency)),
        reasonClause:
          str(event.payload.reason) === "dispute"
            ? "the client's payment was disputed"
            : "the client's payment was refunded",
        payoutsUrl: pageUrl(brand, "/talent/settings/payouts"),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      }),
  },
};

/** payment.refunded → the client whose booking payment was refunded or whose
 *  dispute closed with the charge reversed (email + in_app). */
const PAYMENT_REFUNDED_CLIENT: CatalogEntry = {
  id: "payment.refunded.client",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.refunded"],
  resolveAudience: refundedClient,
  in_app: {
    kind: "payment",
    surface: "client",
    title: (event) =>
      str(event.payload.reason) === "dispute" ? "Payment dispute closed" : "Payment refunded",
    body: (event) =>
      str(event.payload.reason) === "dispute"
        ? "The dispute on your booking payment was resolved and the charge was reversed."
        : "Your booking payment was refunded to your original payment method.",
  },
  email: {
    templateId: "client.payment_refunded",
    subject: (event) =>
      str(event.payload.reason) === "dispute" ? "Payment dispute closed" : "Payment refunded",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const isDispute = str(event.payload.reason) === "dispute";
      return React.createElement(ClientPaymentRefunded, {
        clientName: recipient.displayName,
        heading: isDispute ? "Payment dispute closed" : "Payment refunded",
        message: isDispute
          ? "the dispute on your booking payment was resolved and the charge was reversed."
          : "your booking payment was refunded to your original payment method.",
        amount: null,
        bookingUrl: pageUrl(brand, "/client/bookings"),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      });
    },
  },
};

/** payment.partial_refund → the client, with the refunded amount (email + in_app). */
const PAYMENT_PARTIAL_REFUND_CLIENT: CatalogEntry = {
  id: "payment.partial_refund.client",
  category: "payments",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["payment.partial_refund"],
  resolveAudience: refundedClient,
  in_app: {
    kind: "payment",
    surface: "client",
    title: () => "Partial refund issued",
    body: (event) => {
      const amount = formatMoneyCents(num(event.payload.refundedCents), str(event.payload.currency));
      return amount
        ? `A partial refund of ${amount} was issued to your original payment method.`
        : "A partial refund was issued to your original payment method.";
    },
  },
  email: {
    templateId: "client.partial_refund",
    subject: () => "Partial refund issued",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const amount = formatMoneyCents(num(event.payload.refundedCents), str(event.payload.currency));
      return React.createElement(ClientPaymentRefunded, {
        clientName: recipient.displayName,
        heading: "Partial refund issued",
        message: `a partial refund of ${amount} was issued to your original payment method.`,
        amount,
        bookingUrl: pageUrl(brand, "/client/bookings"),
        brand,
        unsubscribeUrl,
        categoryLabel: "payments",
      });
    },
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

/** workspace.trial_will_end → the agency owner (email + in_app). */
const WORKSPACE_TRIAL_WILL_END: CatalogEntry = {
  id: "workspace.trial_will_end",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["workspace.trial_will_end"],
  resolveAudience: workspaceOwner,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: () => "Your trial is ending soon",
    body: (event) => {
      const ends = formatDateLabel(str(event.payload.trialEndIso));
      return ends
        ? `Your trial ends on ${ends}. Add a payment method to keep your features.`
        : "Your trial is ending soon. Add a payment method to keep your features.";
    },
  },
  email: {
    templateId: "billing.trial_will_end.workspace",
    subject: () => "Your trial is ending soon",
    render: ({ event, recipient, brand }) =>
      React.createElement(BillingTrialWillEnd, {
        recipientName: recipient.displayName,
        planLabel: planLabel(str(event.payload.planKey)),
        trialEndsAt: formatDateLabel(str(event.payload.trialEndIso)) ?? null,
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
      }),
  },
};

/** talent.trial_will_end → the talent (email + in_app); platform-scoped (Tulala). */
const TALENT_TRIAL_WILL_END: CatalogEntry = {
  id: "talent.trial_will_end",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["talent.trial_will_end"],
  resolveAudience: invitedTalent, // talentProfileId (payload) → talent_profiles.user_id
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Your trial is ending soon",
    body: (event) => {
      const ends = formatDateLabel(str(event.payload.trialEndIso));
      return ends
        ? `Your trial ends on ${ends}. Confirm your subscription to keep your features.`
        : "Your trial is ending soon. Confirm your subscription to keep your features.";
    },
  },
  email: {
    templateId: "billing.trial_will_end.talent",
    subject: () => "Your trial is ending soon",
    render: ({ event, recipient, brand }) =>
      React.createElement(BillingTrialWillEnd, {
        recipientName: recipient.displayName,
        planLabel: planLabel(str(event.payload.planKey)),
        trialEndsAt: formatDateLabel(str(event.payload.trialEndIso)) ?? null,
        billingUrl: pageUrl(brand, "/talent/settings"),
        brand,
      }),
  },
};

/**
 * workspace.discount_ending / talent.discount_ending — a time-boxed discount is
 * about to lapse.
 *
 * Distinct from trial_will_end on purpose: Stripe fires no event before a
 * coupon expires, so this is emitted by a scheduled sweep over the mirrored
 * discount_ends_at. The copy asks for nothing — the point is that the next
 * invoice is never a surprise, which is what keeps a generous campaign from
 * turning into refund requests.
 */
const WORKSPACE_DISCOUNT_ENDING: CatalogEntry = {
  id: "workspace.discount_ending",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["workspace.discount_ending"],
  resolveAudience: workspaceOwner,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: () => "Your discount ends soon",
    body: (event) => {
      const ends = formatDateLabel(str(event.payload.discountEndsIso));
      return ends
        ? `Your discount ends on ${ends}. Your next invoice will be at the standard rate.`
        : "Your discount is ending. Your next invoice will be at the standard rate.";
    },
  },
  email: {
    templateId: "billing.discount_ending.workspace",
    subject: () => "Your discount ends soon",
    render: ({ event, recipient, brand }) =>
      React.createElement(BillingDiscountEnding, {
        recipientName: recipient.displayName,
        planLabel: planLabel(str(event.payload.planKey)),
        discountEndsAt: formatDateLabel(str(event.payload.discountEndsIso)) ?? null,
        nextAmount: str(event.payload.nextAmountLabel) ?? null,
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
      }),
  },
};

const TALENT_DISCOUNT_ENDING: CatalogEntry = {
  id: "talent.discount_ending",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["talent.discount_ending"],
  resolveAudience: invitedTalent,
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Your discount ends soon",
    body: (event) => {
      const ends = formatDateLabel(str(event.payload.discountEndsIso));
      return ends
        ? `Your discount ends on ${ends}. Your next invoice will be at the standard rate.`
        : "Your discount is ending. Your next invoice will be at the standard rate.";
    },
  },
  email: {
    templateId: "billing.discount_ending.talent",
    subject: () => "Your discount ends soon",
    render: ({ event, recipient, brand }) =>
      React.createElement(BillingDiscountEnding, {
        recipientName: recipient.displayName,
        planLabel: planLabel(str(event.payload.planKey)),
        discountEndsAt: formatDateLabel(str(event.payload.discountEndsIso)) ?? null,
        nextAmount: str(event.payload.nextAmountLabel) ?? null,
        billingUrl: pageUrl(brand, "/talent/settings"),
        brand,
      }),
  },
};

/** workspace.trial_started → the agency owner (email + in_app). */
const WORKSPACE_TRIAL_STARTED: CatalogEntry = {
  id: "workspace.trial_started",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["workspace.trial_started"],
  resolveAudience: workspaceOwner,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: () => "Your trial is active",
    body: (event) => {
      const ends = formatDateLabel(str(event.payload.trialEndIso));
      return ends ? `Your trial is active until ${ends}.` : "Your trial is active.";
    },
  },
  email: {
    templateId: "billing.trial_started.workspace",
    subject: () => "Your trial is active",
    render: ({ event, recipient, brand }) =>
      React.createElement(BillingTrialStarted, {
        recipientName: recipient.displayName,
        planLabel: planLabel(str(event.payload.planKey)),
        trialEndsAt: formatDateLabel(str(event.payload.trialEndIso)) ?? null,
        billingUrl: pageUrl(brand, "/admin/account"),
        brand,
      }),
  },
};

/** talent.trial_started → the talent (email + in_app); platform-scoped (Tulala). */
const TALENT_TRIAL_STARTED: CatalogEntry = {
  id: "talent.trial_started",
  category: "billing",
  defaultChannels: ["email", "in_app"],
  required: true,
  triggers: ["talent.trial_started"],
  resolveAudience: invitedTalent, // talentProfileId (payload) → talent_profiles.user_id
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Your trial is active",
    body: (event) => {
      const ends = formatDateLabel(str(event.payload.trialEndIso));
      return ends ? `Your trial is active until ${ends}.` : "Your trial is active.";
    },
  },
  email: {
    templateId: "billing.trial_started.talent",
    subject: () => "Your trial is active",
    render: ({ event, recipient, brand }) =>
      React.createElement(BillingTrialStarted, {
        recipientName: recipient.displayName,
        planLabel: planLabel(str(event.payload.planKey)),
        trialEndsAt: formatDateLabel(str(event.payload.trialEndIso)) ?? null,
        billingUrl: pageUrl(brand, "/talent/settings"),
        brand,
      }),
  },
};

/** The Stripe payment + billing entries, in catalog order. */
export const BILLING_CATALOG_ENTRIES: CatalogEntry[] = [
  PAYMENT_DISPUTE_OPENED_PLATFORM,
  PAYMENT_RECEIVED_CLIENT,
  PAYMENT_RECEIVED_WORKSPACE,
  PAYMENT_INVOICE_ISSUED_CLIENT,
  PAYMENT_DEPOSIT_RECEIVED_CLIENT,
  PAYMENT_FAILED_WORKSPACE,
  PAYMENT_PAYOUT_SETTLED_TALENT,
  PAYMENT_PAYOUT_REVERSED_TALENT,
  PAYMENT_REFUNDED_CLIENT,
  PAYMENT_PARTIAL_REFUND_CLIENT,
  WORKSPACE_PLAN_UPGRADED,
  WORKSPACE_PLAN_DOWNGRADED,
  WORKSPACE_SUBSCRIPTION_CANCELLED,
  WORKSPACE_TRIAL_WILL_END,
  TALENT_TRIAL_WILL_END,
  WORKSPACE_DISCOUNT_ENDING,
  TALENT_DISCOUNT_ENDING,
  WORKSPACE_TRIAL_STARTED,
  TALENT_TRIAL_STARTED,
];
