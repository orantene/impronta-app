/**
 * client-record.ts — one client, assembled. PURE: no database, no clock.
 *
 * THREE THINGS ARE CALLED A CLIENT IN THIS DATABASE
 * ─────────────────────────────────────────────────
 * They are not synonyms and confusing them is how a balance ends up on the
 * wrong page. Named once, here, and referred to by these names everywhere else:
 *
 *   `customers`                    — TENANT-SCOPED, identified by email or
 *                                    phone, an account is optional. THIS IS THE
 *                                    ONE MONEY HANGS OFF: `orders.customer_id`
 *                                    points here and nowhere else. A guest who
 *                                    paid cash exists here and only here.
 *   `client_profiles` + `agency_client_relationships`
 *                                  — the older CRM pair: a platform ACCOUNT and
 *                                    that account's relationship with this
 *                                    workspace. Carries notes and tags. Carries
 *                                    no money and no email. Its own migration
 *                                    calls itself the expand half of an
 *                                    expand-then-contract that has not
 *                                    contracted, so both still exist.
 *   `client_accounts` + `client_account_contacts`
 *                                  — a COMPANY and the humans at it. What a
 *                                    booking's `client_account_id` /
 *                                    `client_contact_id` point at. A company is
 *                                    not a customer: it never pays, a contact
 *                                    at it does.
 *
 * The client record reads the FIRST of those as its spine and hangs the other
 * two off it as context. That is why `customerId` is required on this type and
 * every other id is nullable.
 *
 * MONEY IS MINOR UNITS. Same rule as `lib/projects/project-record.ts`.
 */

export type ClientPurchase = {
  readonly orderId: string;
  readonly status: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly collectedCents: number;
  readonly outstandingCents: number;
  readonly createdAt: string;
  readonly lineCount: number;
  /** The conversation, when the order came from one. */
  readonly inquiryId: string | null;
};

export type ClientProjectLink = {
  readonly projectId: string;
  readonly title: string;
  readonly status: string;
  readonly startsAt: string | null;
};

export type ClientBookingLink = {
  readonly bookingId: string;
  readonly title: string;
  readonly startsAt: string | null;
  readonly status: string;
};

export type ClientRecord = {
  readonly customerId: string;
  readonly tenantId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly phoneE164: string | null;
  /** Present only when this customer also has a platform account. */
  readonly clientProfileId: string | null;
  readonly userId: string | null;
  readonly locale: string | null;
  readonly visits: number;
  readonly noShows: number;
  readonly lastSeenAt: string | null;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly purchases: readonly ClientPurchase[];
  readonly projects: readonly ClientProjectLink[];
  readonly bookings: readonly ClientBookingLink[];
};

export type ClientBalanceTotal = {
  readonly currency: string;
  readonly outstandingCents: number;
  readonly collectedCents: number;
};

/**
 * What this client owes, PER CURRENCY.
 *
 * Never one number. `orders.currency` is per row, so a workspace that has ever
 * taken a peso and a dollar would otherwise see 4500 + 20 = 4520 of nothing.
 * The screen renders one line per entry and the arithmetic stays honest.
 */
export function clientBalances(record: ClientRecord): ClientBalanceTotal[] {
  const byCurrency = new Map<string, { outstandingCents: number; collectedCents: number }>();
  for (const p of record.purchases) {
    const key = (p.currency || "USD").toUpperCase();
    const acc = byCurrency.get(key) ?? { outstandingCents: 0, collectedCents: 0 };
    acc.outstandingCents += p.outstandingCents;
    acc.collectedCents += p.collectedCents;
    byCurrency.set(key, acc);
  }
  return [...byCurrency.entries()]
    .map(([currency, acc]) => ({ currency, ...acc }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** The purchases a Collect would apply to: unpaid, most recent first. */
export function unpaidPurchases(record: ClientRecord): ClientPurchase[] {
  return record.purchases
    .filter((p) => p.outstandingCents > 0)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export type CollectRefusal = "nothing_owed" | "mixed_currency";

export type CollectVerdict =
  | { readonly ok: true; readonly currency: string; readonly outstandingCents: number; readonly recordCount: number }
  | { readonly ok: false; readonly reason: CollectRefusal };

/**
 * May a Collect be started for this client, and for how much.
 *
 * REFUSES A MIXED-CURRENCY CLIENT RATHER THAN GUESSING. Two open records in two
 * currencies have no single amount to collect, and picking one silently would
 * charge the wrong figure. The screen says so and asks the operator to open a
 * record; it does not offer a button that produces a number nobody chose.
 */
export function collectVerdict(record: ClientRecord): CollectVerdict {
  const unpaid = unpaidPurchases(record);
  if (unpaid.length === 0) return { ok: false, reason: "nothing_owed" };
  const currencies = new Set(unpaid.map((p) => (p.currency || "USD").toUpperCase()));
  if (currencies.size > 1) return { ok: false, reason: "mixed_currency" };
  const currency = [...currencies][0]!;
  return {
    ok: true,
    currency,
    outstandingCents: unpaid.reduce((sum, p) => sum + p.outstandingCents, 0),
    recordCount: unpaid.length,
  };
}
