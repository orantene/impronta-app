/**
 * checkout-country.ts (TUL-1865) · country prefill for hosted Checkout.
 *
 * WHAT STRIPE ALLOWS. A payment-mode Checkout Session has NO country parameter.
 * The "Country or region" box defaults from the buyer's IP / browser, so an MX
 * guest paying MXN from a US network (or a VPN, or a test machine) saw US.
 * Two things are settable:
 *   - `locale` (already sent from the app language), and
 *   - a Stripe Customer whose `address.country` is set: when the session is
 *     created with `customer` (instead of `customer_email`) Checkout starts the
 *     billing country from that address.
 * Adaptive pricing and `billing_address_collection` do not choose a country
 * (the latter only decides whether the full address is asked).
 *
 * THE HINT. A caller that knows the payer's country passes `payerCountry`.
 * Otherwise the seller's platform decides: charges settled on the MX platform
 * are MXN charges to a Mexican seller, so MX is the honest default. The hint
 * only pre-selects; the buyer can still change it.
 *
 * NEVER BLOCKS PAYMENT. Creating the customer is best effort: any failure
 * returns null and the session falls back to `customer_email`.
 */
import type Stripe from "stripe";
import { logServerError } from "@/lib/server/safe-error";

/** ISO 3166-1 alpha-2, upper-cased, or null when not a plausible code. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  const c = raw?.trim().toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) ? c : null;
}

export function checkoutCountryHint(
  payerCountry: string | null | undefined,
  platform: "us" | "mx" | string,
): string | null {
  return normalizeCountry(payerCountry) ?? (platform === "mx" ? "MX" : null);
}

/**
 * A Customer carrying the payer's email and country, keyed on the transaction
 * so a retried call reuses it. Null on any failure.
 */
export async function createCountryCustomer(
  stripe: Pick<Stripe, "customers">,
  input: { transactionId: string; email: string; country: string },
): Promise<string | null> {
  try {
    const customer = await stripe.customers.create(
      { email: input.email, address: { country: input.country }, metadata: { transaction_id: input.transactionId } },
      { idempotencyKey: `cust_txn_${input.transactionId}` },
    );
    return customer.id;
  } catch (err) {
    logServerError("payments.stripe.checkoutCountryCustomer", err);
    return null;
  }
}
