/**
 * lib/ledger/project.ts
 *
 * Turn money events into balanced double-entry legs.
 *
 * PURE. No database, no Stripe, no side effects — given the same inputs it
 * returns the same legs. That matters more here than almost anywhere else in
 * the codebase: the ledger is the thing every financial answer will be derived
 * from, so the rules that build it have to be assertable exhaustively without
 * a live account.
 *
 * ── The convention, stated once ─────────────────────────────────────────────
 * `amountCents` is SIGNED. Positive is a DEBIT, negative is a CREDIT. Every
 * group must sum to zero per currency, which the database enforces with a
 * deferred constraint trigger; these functions exist to make that easy to
 * satisfy correctly rather than to be the only thing standing between us and an
 * unbalanced book.
 *
 * ── Why groups are deterministic ────────────────────────────────────────────
 * `groupKey` is derived from the source object, never generated randomly, so
 * projecting the same payment twice produces the same group id and the writer
 * can skip it. A ledger that can double-count on a retry is worse than no
 * ledger, because the second copy looks exactly as legitimate as the first.
 */

export type LedgerLeg = {
  /** Stable, derived from the source object. The writer hashes it to a uuid. */
  groupKey: string;
  groupKind: string;
  /** `ledger_accounts.code`. Never a display name — codes are the stable key. */
  accountCode: string;
  /** SIGNED minor units: positive debit, negative credit. */
  amountCents: number;
  currency: string;
  tenantId?: string | null;
  talentProfileId?: string | null;
  bookingId?: string | null;
  bookingTransactionId?: string | null;
  providerObjectId?: string | null;
  occurredAt: string;
  memo?: string | null;
};

/** One participant's slice of a booking, straight off the commission snapshot. */
export type CommissionLane = {
  participantId: string;
  talentProfileId: string | null;
  owningPartyType: string;
  owningPartyId: string | null;
  talentNetCents: number;
  workspaceFeeCents: number;
  platformFeeCents: number;
  grossChargedCents: number;
};

export type BookingPaymentInput = {
  transactionId: string;
  bookingId: string | null;
  tenantId: string | null;
  currency: string;
  /** What the client was actually charged, from the settled transaction. */
  grossChargedCents: number;
  lanes: CommissionLane[];
  /** The Stripe charge or PaymentIntent this settled on. */
  providerObjectId: string | null;
  occurredAt: string;
};

export type ProjectionResult =
  | { ok: true; legs: LedgerLeg[] }
  | { ok: false; error: string };

/** Sum a set of legs per currency. Exported because the tests and the writer
 *  both want to prove balance before touching the database. */
export function sumByCurrency(legs: LedgerLeg[]): Record<string, number> {
  return legs.reduce<Record<string, number>>((acc, leg) => {
    acc[leg.currency] = (acc[leg.currency] ?? 0) + leg.amountCents;
    return acc;
  }, {});
}

export function legsBalance(legs: LedgerLeg[]): boolean {
  return Object.values(sumByCurrency(legs)).every((v) => v === 0);
}

/**
 * A client's booking payment.
 *
 * The money arrives on the platform's Stripe balance, and at that instant most
 * of it belongs to someone else:
 *
 *   DEBIT   stripe_balance        gross charged      (it is here)
 *   CREDIT  talent_payable        talent net         (owed to the talent)
 *   CREDIT  workspace_payable     workspace fee      (owed to the workspace)
 *   CREDIT  platform_commission   platform fee       (ours, earned)
 *
 * The three credits sum to the debit because the commission engine guarantees
 * `talent_net + workspace_fee + platform_fee === gross_charged`. That invariant
 * is checked here rather than trusted: if a snapshot ever violates it, this
 * refuses to project instead of writing a book that silently does not balance.
 *
 * The processing fee is deliberately NOT part of this group — Stripe deducts it
 * as a separate balance transaction, and pretending otherwise would make the
 * ledger disagree with the provider. See `projectProcessingFee`.
 */
export function projectBookingPayment(input: BookingPaymentInput): ProjectionResult {
  if (!input.transactionId) return { ok: false, error: "transactionId is required" };
  if (input.grossChargedCents <= 0) {
    return { ok: false, error: "a booking payment must have a positive gross" };
  }
  if (input.lanes.length === 0) {
    // No snapshot means we cannot say who the money belongs to. Projecting a
    // bare "money arrived" leg would strand it against nothing and quietly
    // overstate what the platform holds.
    return { ok: false, error: "no commission lanes — cannot attribute the payment" };
  }

  const currency = input.currency.toUpperCase();
  const groupKey = `booking_payment:${input.transactionId}`;
  const common = {
    groupKey,
    groupKind: "booking_payment",
    currency,
    bookingId: input.bookingId ?? null,
    bookingTransactionId: input.transactionId,
    providerObjectId: input.providerObjectId ?? null,
    occurredAt: input.occurredAt,
  };

  const talentTotal = input.lanes.reduce((s, l) => s + l.talentNetCents, 0);
  const workspaceTotal = input.lanes.reduce((s, l) => s + l.workspaceFeeCents, 0);
  const platformTotal = input.lanes.reduce((s, l) => s + l.platformFeeCents, 0);
  const attributed = talentTotal + workspaceTotal + platformTotal;

  if (attributed !== input.grossChargedCents) {
    return {
      ok: false,
      error:
        `commission lanes sum to ${attributed} but the client was charged ` +
        `${input.grossChargedCents} ${currency}. Refusing to project an unbalanced payment.`,
    };
  }

  const legs: LedgerLeg[] = [
    {
      ...common,
      accountCode: "stripe_balance",
      amountCents: input.grossChargedCents,
      tenantId: input.tenantId ?? null,
      memo: "Client payment received",
    },
  ];

  // Per lane, so a multi-talent booking credits each talent separately and the
  // liability is answerable per person rather than as one lump.
  for (const lane of input.lanes) {
    if (lane.talentNetCents !== 0) {
      legs.push({
        ...common,
        accountCode: "talent_payable",
        amountCents: -lane.talentNetCents,
        talentProfileId: lane.talentProfileId,
        tenantId: input.tenantId ?? null,
        memo: "Owed to talent",
      });
    }
    if (lane.workspaceFeeCents !== 0) {
      legs.push({
        ...common,
        accountCode: "workspace_payable",
        amountCents: -lane.workspaceFeeCents,
        tenantId: lane.owningPartyId ?? input.tenantId ?? null,
        memo: "Owed to workspace",
      });
    }
    if (lane.platformFeeCents !== 0) {
      legs.push({
        ...common,
        accountCode: "platform_commission",
        amountCents: -lane.platformFeeCents,
        tenantId: input.tenantId ?? null,
        memo: "Platform commission",
      });
    }
  }

  return { ok: true, legs };
}

/**
 * Stripe's processing fee, as its own group.
 *
 *   DEBIT   processing_fees    fee     (our cost)
 *   CREDIT  stripe_balance     fee     (taken out of the balance)
 *
 * Separate from the payment because that is how it actually happens: Stripe
 * settles the fee as its own balance transaction. Folding it into the payment
 * group would make our stripe_balance disagree with Stripe's, which is exactly
 * the disagreement reconciliation exists to detect.
 *
 * `feeCents` is expected POSITIVE (a cost). Stripe reports it positive on the
 * balance transaction even though it reduces the balance.
 */
export function projectProcessingFee(input: {
  balanceTransactionId: string;
  feeCents: number;
  currency: string;
  tenantId?: string | null;
  bookingTransactionId?: string | null;
  occurredAt: string;
}): ProjectionResult {
  if (input.feeCents === 0) {
    // Not an error — plenty of balance transactions carry no fee. There is
    // simply nothing to record, and a zero-amount leg is rejected by the schema.
    return { ok: true, legs: [] };
  }
  if (input.feeCents < 0) {
    return { ok: false, error: "processing fee must be positive (it is a cost)" };
  }

  const currency = input.currency.toUpperCase();
  const common = {
    groupKey: `processing_fee:${input.balanceTransactionId}`,
    groupKind: "processing_fee",
    currency,
    tenantId: input.tenantId ?? null,
    bookingTransactionId: input.bookingTransactionId ?? null,
    providerObjectId: input.balanceTransactionId,
    occurredAt: input.occurredAt,
  };

  return {
    ok: true,
    legs: [
      { ...common, accountCode: "processing_fees", amountCents: input.feeCents, memo: "Stripe processing fee" },
      { ...common, accountCode: "stripe_balance", amountCents: -input.feeCents, memo: "Fee deducted from balance" },
    ],
  };
}

/**
 * A refund to a client.
 *
 *   DEBIT   refunds_contra    amount   (reduces revenue)
 *   CREDIT  stripe_balance    amount   (money leaves)
 *
 * Deliberately a CONTRA entry rather than a negative revenue entry. "Gross
 * revenue" and "revenue net of refunds" are different numbers that a finance
 * team needs separately, and netting them at write time destroys the ability to
 * report either honestly.
 */
export function projectRefund(input: {
  refundId: string;
  amountCents: number;
  currency: string;
  tenantId?: string | null;
  bookingId?: string | null;
  bookingTransactionId?: string | null;
  occurredAt: string;
}): ProjectionResult {
  if (input.amountCents <= 0) {
    return { ok: false, error: "a refund must have a positive amount" };
  }
  const currency = input.currency.toUpperCase();
  const common = {
    groupKey: `refund:${input.refundId}`,
    groupKind: "refund",
    currency,
    tenantId: input.tenantId ?? null,
    bookingId: input.bookingId ?? null,
    bookingTransactionId: input.bookingTransactionId ?? null,
    providerObjectId: input.refundId,
    occurredAt: input.occurredAt,
  };
  return {
    ok: true,
    legs: [
      { ...common, accountCode: "refunds_contra", amountCents: input.amountCents, memo: "Refund issued" },
      { ...common, accountCode: "stripe_balance", amountCents: -input.amountCents, memo: "Refund left the balance" },
    ],
  };
}

/**
 * A paid subscription invoice.
 *
 *   DEBIT   stripe_balance          total   (money arrived)
 *   CREDIT  subscription_revenue    net     (ours, earned)
 *   CREDIT  tax_payable             tax     (collected for an authority)
 *
 * The tax leg is emitted only when tax is non-zero, which is never today —
 * Stripe Tax is off and nothing calculates tax. It is here so that switching
 * tax on does not require revisiting the ledger, and so that collected tax is
 * a LIABILITY from the first cent rather than being booked as revenue and
 * corrected later.
 */
export function projectSubscriptionInvoice(input: {
  invoiceId: string;
  amountPaidCents: number;
  taxCents: number;
  currency: string;
  tenantId?: string | null;
  talentProfileId?: string | null;
  occurredAt: string;
}): ProjectionResult {
  if (input.amountPaidCents <= 0) {
    return { ok: false, error: "an invoice projection needs a positive amount paid" };
  }
  if (input.taxCents < 0) return { ok: false, error: "tax cannot be negative" };
  if (input.taxCents > input.amountPaidCents) {
    return { ok: false, error: "tax cannot exceed the amount paid" };
  }

  const currency = input.currency.toUpperCase();
  const common = {
    groupKey: `subscription_invoice:${input.invoiceId}`,
    groupKind: "subscription_invoice",
    currency,
    tenantId: input.tenantId ?? null,
    talentProfileId: input.talentProfileId ?? null,
    providerObjectId: input.invoiceId,
    occurredAt: input.occurredAt,
  };

  const legs: LedgerLeg[] = [
    { ...common, accountCode: "stripe_balance", amountCents: input.amountPaidCents, memo: "Subscription invoice paid" },
    {
      ...common,
      accountCode: "subscription_revenue",
      amountCents: -(input.amountPaidCents - input.taxCents),
      memo: "Subscription revenue",
    },
  ];
  if (input.taxCents > 0) {
    legs.push({ ...common, accountCode: "tax_payable", amountCents: -input.taxCents, memo: "Tax collected" });
  }
  return { ok: true, legs };
}

/**
 * A payout leaving the Stripe balance for the bank.
 *
 *   DEBIT   stripe_in_transit   amount   (in flight)
 *   CREDIT  stripe_balance      amount   (left Stripe)
 *
 * and on arrival, a second group:
 *
 *   DEBIT   bank                amount
 *   CREDIT  stripe_in_transit   amount
 *
 * Two groups rather than one because the money genuinely spends days in
 * between, and a balance sheet that cannot show "in transit" cannot explain the
 * gap between the Stripe dashboard and the bank statement.
 */
export function projectPayout(input: {
  payoutId: string;
  amountCents: number;
  currency: string;
  /** 'initiated' when it leaves Stripe, 'arrived' when it lands in the bank. */
  phase: "initiated" | "arrived";
  occurredAt: string;
}): ProjectionResult {
  if (input.amountCents <= 0) return { ok: false, error: "a payout must have a positive amount" };
  const currency = input.currency.toUpperCase();
  const common = {
    groupKey: `payout_${input.phase}:${input.payoutId}`,
    groupKind: `payout_${input.phase}`,
    currency,
    providerObjectId: input.payoutId,
    occurredAt: input.occurredAt,
  };
  const [debit, credit] =
    input.phase === "initiated"
      ? (["stripe_in_transit", "stripe_balance"] as const)
      : (["bank", "stripe_in_transit"] as const);
  return {
    ok: true,
    legs: [
      { ...common, accountCode: debit, amountCents: input.amountCents, memo: `Payout ${input.phase}` },
      { ...common, accountCode: credit, amountCents: -input.amountCents, memo: `Payout ${input.phase}` },
    ],
  };
}
