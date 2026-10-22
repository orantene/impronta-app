/**
 * Stored Stripe customer ids can outlive the Stripe account that minted them
 * (staging switched sandboxes: "No such customer: 'cus_...'" on checkout).
 * `storedCustomerIsStale` lets getOrCreate*StripeCustomer self-heal: a deleted or
 * unknown customer is stale; any other Stripe error is rethrown as a real error.
 */
import type Stripe from "stripe";

type CustomerReader = Pick<Stripe["customers"], "retrieve">;

function isMissing(err: unknown): boolean {
  const e = err as { code?: unknown; statusCode?: unknown } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}

/** true = stale (deleted or resource_missing); false = usable. Throws on any other error. */
export async function storedCustomerIsStale(stripe: { customers: CustomerReader }, customerId: string): Promise<boolean> {
  try {
    const c = await stripe.customers.retrieve(customerId);
    return "deleted" in c && c.deleted === true;
  } catch (err) {
    if (isMissing(err)) return true;
    throw err;
  }
}

/**
 * TUL-1874: Stripe renders invoice PDFs, receipts and emails in the customer's `preferred_locales`, which was
 * never set, so a Spanish talent got English invoices. Only languages the product speaks are sent.
 */
export function stripePreferredLocales(locale: string | null | undefined): string[] | undefined {
  const l = locale?.trim().toLowerCase();
  if (!l) return undefined;
  if (l.startsWith("es")) return ["es"];
  if (l.startsWith("en")) return ["en"];
  return undefined;
}

/** Best effort: a Stripe hiccup must never block a checkout, and the next checkout retries. */
export async function syncCustomerPreferredLocale(
  stripe: { customers: Pick<Stripe["customers"], "update"> },
  customerId: string,
  locale: string | null | undefined,
  onError?: (err: unknown) => void,
): Promise<void> {
  const preferred = stripePreferredLocales(locale);
  if (!preferred) return;
  try {
    await stripe.customers.update(customerId, { preferred_locales: preferred });
  } catch (err) {
    onError?.(err);
  }
}
