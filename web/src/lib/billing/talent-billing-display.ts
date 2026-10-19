/**
 * lib/billing/talent-billing-display.ts (TUL-835)
 *
 * Pure display helpers for Talent > Settings > Billing. Display only: nothing
 * here reads or writes amounts, prices, plans or Stripe state.
 *
 * Card on file: Stripe can hold the default card in three places. A Checkout
 * subscription usually carries it on `subscription.default_payment_method`,
 * while `customer.invoice_settings.default_payment_method` stays empty, so a
 * customer-only read said "No card on file" for a talent paying with a card.
 * The lookup order matches the order Stripe itself charges in.
 */

export type CardSummary = { brand: string; last4: string };

type CardFields = { brand?: unknown; last4?: unknown };

function asCard(fields: CardFields | null | undefined): CardSummary | null {
  if (!fields) return null;
  const { brand, last4 } = fields;
  if (typeof brand !== "string" || typeof last4 !== "string" || !brand || !last4) return null;
  return { brand, last4 };
}

/**
 * Brand + last4 of one expanded Stripe object, or null. Accepts a
 * PaymentMethod (`{ card: { brand, last4 } }`), a legacy Card source
 * (`{ object: "card", brand, last4 }`) or a Source with a card. An unexpanded
 * id string, a deleted object or a non-card method gives null.
 */
export function cardFromStripeObject(value: unknown): CardSummary | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { deleted?: unknown; object?: unknown; card?: CardFields | null } & CardFields;
  if (obj.deleted === true) return null;
  if (obj.object === "card") return asCard(obj);
  return asCard(obj.card ?? null);
}

/**
 * The card a talent sees in Billing: subscription default first, then the
 * customer's invoice default, then the customer's legacy default source.
 */
export function pickDefaultCard(input: {
  subscriptionDefaultPaymentMethod?: unknown;
  customerInvoiceDefaultPaymentMethod?: unknown;
  customerDefaultSource?: unknown;
}): CardSummary | null {
  return (
    cardFromStripeObject(input.subscriptionDefaultPaymentMethod) ??
    cardFromStripeObject(input.customerInvoiceDefaultPaymentMethod) ??
    cardFromStripeObject(input.customerDefaultSource)
  );
}

/**
 * The English source label for a talent plan key, in the SAME words the rest
 * of the talent dashboard prints (TALENT_TIER_META labels), so the dashboard
 * dictionary translates it ("Web Office" -> "Oficina Web"). The server plan
 * catalog can say "Portfolio" (pre-rename overlay), which has no Spanish entry
 * and leaked into the Spanish Billing panel. Unknown keys return null and the
 * caller keeps its own label.
 */
const TALENT_PLAN_SOURCE_LABEL: Readonly<Record<string, string>> = {
  talent_basic: "Free",
  talent_pro: "Pro",
  talent_portfolio: "Web Office",
};

/**
 * What the talent past-due banner needs, or null when there is nothing to
 * warn about. Only a past_due subscription produces a banner; the grace math
 * itself stays in dunning-grace.ts (PastDueBanner calls resolveDunningGrace).
 */
export type TalentPastDueView = { status: "past_due"; pastDueSince: string | null };

export function talentPastDueView(
  sub: { status?: string | null; pastDueSince?: string | null } | null | undefined,
): TalentPastDueView | null {
  if (!sub || sub.status !== "past_due") return null;
  return { status: "past_due", pastDueSince: sub.pastDueSince ?? null };
}

export function talentBillingPlanLabel(planKey: string | null | undefined): string | null {
  return TALENT_PLAN_SOURCE_LABEL[(planKey ?? "").trim()] ?? null;
}
