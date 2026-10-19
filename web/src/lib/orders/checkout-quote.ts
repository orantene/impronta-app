/**
 * What Stripe Checkout will collect for a booking, read BEFORE Stripe (TUL-1268 item 5).
 * A thin wrapper: the amounts come from `resolveCheckoutCollectCents`, the one function
 * `createPurchase` charges with. Read only; nothing here creates an order or moves money.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCheckoutCollectCents } from "@/lib/orders/purchase-collect";
import type { CheckoutQuote } from "@/lib/orders/checkout-quote-display";

export async function quoteCheckoutCollect(
  admin: SupabaseClient,
  input: Parameters<typeof resolveCheckoutCollectCents>[1],
): Promise<CheckoutQuote> {
  const { baseCollectCents, collectCents } = await resolveCheckoutCollectCents(admin, input);
  return {
    principalCents: baseCollectCents,
    collectCents,
    cardFeeCents: Math.max(0, collectCents - baseCollectCents),
    currency: input.orderCurrency,
  };
}
