/**
 * WHO an order needs a name for, decided by the PRODUCT and never by the money.
 *
 * The rule this file replaces was "any paid order needs an email or a phone".
 * That is not a rule about identity, it is a rule about money, and it made the
 * commonest sale on a counter impossible: an anonymous cash walk-in buying a
 * coffee. Nobody asks a coffee shop for an email. The retrieval anchor for that
 * sale is `orders.receipt_code`, printed on the slip and resolvable at
 * `/r/<code>` by whoever holds it.
 *
 * What genuinely needs a name is a PROPERTY OF THE THING SOLD:
 *   - `attendee_names`: a ticket the door checks a person against.
 *   - `delivery`: something that has to reach an address or an inbox.
 *   - `entitlement`: credit the buyer spends later, which has to belong to
 *     somebody to be spendable at all.
 *
 * So the decision is a pure function of the order's lines. Free or paid does
 * not enter into it: a complimentary ticket still needs the attendee's name,
 * and a $9 espresso still does not.
 *
 * Pure by design — no client, no I/O. Both callers (the POS counter and the
 * public purchase pipeline) read their own rows and hand them here, so the two
 * cannot drift into two different answers.
 *
 * WHAT THE DEMAND IS OWED TO. A sale, and only a sale. The first version of
 * this rule asked "is the order leaving draft", which made a VOID and an
 * EXPIRY into things the demand could refuse: an anonymous draft holding a
 * gala ticket could not be paid (right) and could not be cancelled either
 * (a locked till). So the question every caller now has to answer out loud is
 * WHICH STATUS the order is moving into, and `lib/orders/order-status` says
 * which of those hold a sale. There is no default: a caller that does not know
 * where the order is going does not know whether identity is owed.
 */

import { isSellingOrderStatus, type OrderStatus } from "@/lib/orders/order-status";

export const IDENTITY_REASONS = ["attendee_names", "delivery", "entitlement"] as const;
export type IdentityReason = (typeof IDENTITY_REASONS)[number];

export function isIdentityReason(value: unknown): value is IdentityReason {
  return typeof value === "string" && (IDENTITY_REASONS as readonly string[]).includes(value);
}

/** One line of the order, as read from `order_lines` joined to its offering. */
export type IdentityLine = {
  offeringId?: string | null;
  /** The offering's title, or the line label. Named in the refusal. */
  offeringTitle?: string | null;
  requiresIdentity?: boolean | null;
  /** `talent_offerings.identity_reason`. Unknown strings are ignored. */
  identityReason?: string | null;
};

export type IdentityDemand = {
  offeringId: string | null;
  offeringTitle: string;
  reason: IdentityReason;
};

const FALLBACK_TITLE = "One item in this sale";

/**
 * WHY each reason needs a name, in the buyer's words. No em dashes: this is
 * user-facing copy.
 */
function why(reason: IdentityReason, title: string): string {
  switch (reason) {
    case "attendee_names":
      return `“${title}” needs a name for every attendee, so this sale needs an email or a phone.`;
    case "delivery":
      return `“${title}” has to be delivered to someone, so this sale needs an email or a phone.`;
    case "entitlement":
      return `“${title}” issues credit the buyer spends later, so it has to belong to an email or a phone.`;
  }
}

/**
 * The FIRST line that demands a name, or null when none does.
 *
 * First rather than all: the counter fixes one thing at a time, and a list of
 * three offerings is not more actionable than the one at the top of the ticket.
 * Order is the caller's (line sort order), so the answer is stable.
 */
export function identityDemand(lines: readonly IdentityLine[]): IdentityDemand | null {
  for (const line of lines) {
    if (line.requiresIdentity !== true) continue;
    // A row flagged `requires_identity` with no valid reason is still a demand.
    // The CHECK on `talent_offerings` makes that pairing impossible going
    // forward; treating an unknown string as "no demand" would turn a data
    // problem into a silently unnamed ticket holder.
    const reason = isIdentityReason(line.identityReason) ? line.identityReason : "attendee_names";
    const title = (line.offeringTitle ?? "").trim() || FALLBACK_TITLE;
    return { offeringId: line.offeringId ?? null, offeringTitle: title, reason };
  }
  return null;
}

export type IdentityVerdict =
  | { ok: true }
  | { ok: false; reason: IdentityReason; offeringId: string | null; offeringTitle: string; message: string };

/**
 * May this order move into `intoStatus` with the identity it has?
 *
 * `hasCustomer` is the only thing that satisfies a demand. A guest session is
 * an anonymity token, not a name: it identifies a browser, and the door cannot
 * check a browser against a ticket.
 *
 * `intoStatus` is required rather than defaulted. A default would be a guess
 * about a caller's intent, and the wrong guess here is the locked till: the
 * cheapest way to keep a void answerable is to make every caller name the
 * transition it is about to write.
 */
export function identityVerdict(input: {
  intoStatus: OrderStatus;
  hasCustomer: boolean;
  lines: readonly IdentityLine[];
}): IdentityVerdict {
  // Abandoning is not selling. Cancelling is how an order carrying a demand
  // nobody can meet gets closed, so it is never the thing a demand refuses.
  if (!isSellingOrderStatus(input.intoStatus)) return { ok: true };
  if (input.hasCustomer) return { ok: true };
  const demand = identityDemand(input.lines);
  if (!demand) return { ok: true };
  return {
    ok: false,
    reason: demand.reason,
    offeringId: demand.offeringId,
    offeringTitle: demand.offeringTitle,
    message: why(demand.reason, demand.offeringTitle),
  };
}
