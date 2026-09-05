import "server-only";

import * as React from "react";
import DisputeOpenedAlert from "../../../emails/platform/DisputeOpenedAlert";
import type { CatalogEntry } from "./types";
import { platformAdmins, str } from "./catalog-audiences";

/** Local, as in catalog-entries-billing: a 3-line coercion is not worth a
 *  shared import, and duplicating it keeps this module self-contained. */
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
import { formatDateLabel, formatMoneyCents } from "./catalog-render";

/**
 * Dispute notifications.
 *
 * Split out of `catalog-entries-billing.ts` rather than raising that file's
 * 800-line cap: disputes are their own concern -- a legal deadline set by the
 * card network, not a billing event -- and the entry needs its own email
 * template and copy. Extraction keeps the cap honest instead of absorbing it.
 */

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
export const PAYMENT_DISPUTE_OPENED_PLATFORM: CatalogEntry = {
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
        // formatDateLabel returns `string | undefined`; the template's prop is
        // `string | null`, and null is what it checks to omit the row.
        dueDate: formatDateLabel(str(event.payload.evidenceDueAt)) ?? null,
        disputeId: str(event.payload.disputeId) || "unknown",
        stripeUrl: `https://dashboard.stripe.com/disputes/${str(event.payload.disputeId) ?? ""}`,
        brand,
      }),
  },
};
