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
