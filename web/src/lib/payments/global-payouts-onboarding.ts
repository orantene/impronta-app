/**
 * lib/payments/global-payouts-onboarding.ts
 *
 * Recipient + funding helpers for the Global Payouts (v2) rail. All endpoints
 * here are confirmed against docs.stripe.com/global-payouts (recipient creation,
 * payout methods, financial addresses, fund-from-balance).
 *
 * NOT YET INCLUDED (endpoints not in the public docs at build time — add when
 * confirmed): the v2 AccountLink for Stripe-hosted recipient collection, and the
 * sandbox `test_helpers` inbound-credit simulation. For sandbox funding use
 * `fundFinancialAccountFromBalance` after a bypass-pending test charge.
 *
 * Server-only.
 */

import "server-only";
import { stripeV2, type StripeV2Result } from "./stripe-v2";
import { assertLivePayoutSafe, getPrimaryFinancialAccountId } from "./global-payouts";
import { logServerError } from "@/lib/server/safe-error";

export type V2Account = {
  id: string;
  object: string;
  configuration?: unknown;
  requirements?: unknown;
  identity?: unknown;
};

/**
 * Create a Global Payouts recipient (v2 core account) able to receive a local
 * bank payout. `country` is the recipient's ISO-2 (lowercased for v2).
 */
export async function createGlobalPayoutsRecipient(opts: {
  email: string;
  displayName: string;
  country: string;
  entityType?: "individual" | "company";
  metadata?: Record<string, string>;
}): Promise<StripeV2Result<V2Account>> {
  return stripeV2.post<V2Account>("/v2/core/accounts", {
    contact_email: opts.email,
    display_name: opts.displayName,
    identity: { country: opts.country.toLowerCase(), entity_type: opts.entityType ?? "individual" },
    configuration: { recipient: { capabilities: { bank_accounts: { local: { requested: true } } } } },
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
    include: ["identity", "configuration.recipient", "requirements"],
  });
}

export type OutboundSetupIntent = {
  id: string;
  object: string;
  status?: string;
  /** The created payout method (an object with its own id), or null. */
  payout_method?: { id: string; type?: string } | null;
};

/**
 * Attach a bank-account PayoutMethod to a recipient via an OutboundSetupIntent
 * (Stripe-Context = the recipient account id).
 */
export async function createRecipientBankPayoutMethod(opts: {
  recipientAccountId: string;
  bank: { country: string; currency: string; accountNumber: string; routingNumber: string };
}): Promise<StripeV2Result<OutboundSetupIntent>> {
  return stripeV2.post<OutboundSetupIntent>(
    "/v2/money_management/outbound_setup_intents",
    {
      payout_method_data: {
        type: "bank_account",
        bank_account: {
          country: opts.bank.country.toUpperCase(),
          // REQUIRED by the v2 API — validated live against the sandbox: omitting
          // currency → HTTP 400 "payout_method_data.bank_account.currency: Required".
          currency: opts.bank.currency.toLowerCase(),
          account_number: opts.bank.accountNumber,
          routing_number: opts.bank.routingNumber,
        },
      },
    },
    { stripeContext: opts.recipientAccountId },
  );
}

export type PayoutMethod = { id: string; object: string; type?: string };

/** List a recipient's payout methods (Stripe-Context scoped). */
export async function listRecipientPayoutMethods(
  recipientAccountId: string,
): Promise<StripeV2Result<{ data: PayoutMethod[] }>> {
  return stripeV2.get<{ data: PayoutMethod[] }>("/v2/money_management/payout_methods", {
    stripeContext: recipientAccountId,
  });
}

export type FinancialAddress = { id: string; object: string; type?: string };

/**
 * Get an existing FinancialAddress for the FA, or create a `us_bank_account` one.
 * Returns an error when Global Payouts isn't active (no FinancialAccount yet).
 */
export async function getOrCreateFinancialAddress(
  financialAccountId?: string | null,
): Promise<StripeV2Result<FinancialAddress>> {
  const faId = financialAccountId ?? (await getPrimaryFinancialAccountId());
  if (!faId) {
    return {
      ok: false,
      status: 0,
      error: { code: "no_financial_account", message: "Global Payouts not active (no FinancialAccount)." },
    };
  }

  const existing = await stripeV2.get<{ data: FinancialAddress[] }>("/v2/money_management/financial_addresses");
  if (existing.ok && existing.data.data?.length) return { ok: true, data: existing.data.data[0] };

  return stripeV2.post<FinancialAddress>("/v2/money_management/financial_addresses", {
    financial_account: faId,
    type: "us_bank_account",
  });
}

/**
 * Fund the FinancialAccount from the platform's v1 Stripe balance — a v1 payout
 * routed to the FA (`POST /v1/payouts` with `payout_method=<fa>`). Form-encoded
 * v1 call (the app's v1 SDK doesn't type the FA payout_method). In a sandbox,
 * first add available balance with a bypass-pending test charge (4000000000000077).
 */
export async function fundFinancialAccountFromBalance(opts: {
  financialAccountId?: string | null;
  amountCents: number;
  currency: string;
  secretKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; payoutId: string } | { ok: false; error: string }> {
  const key = opts.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "Stripe not configured" };
  const guard = assertLivePayoutSafe(key);
  if (!guard.ok) return { ok: false, error: guard.error };
  const faId = opts.financialAccountId ?? (await getPrimaryFinancialAccountId());
  if (!faId) return { ok: false, error: "no FinancialAccount (Global Payouts not active)" };

  const form = new URLSearchParams({
    payout_method: faId,
    amount: String(opts.amountCents),
    currency: opts.currency.toLowerCase(),
  });
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch("https://api.stripe.com/v1/payouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, payoutId: json.id ?? "" };
  } catch (err) {
    logServerError("global-payouts.fundFromBalance", err);
    return { ok: false, error: err instanceof Error ? err.message : "fund failed" };
  }
}
