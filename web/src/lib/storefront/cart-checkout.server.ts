"use server";

/** cart_checkout — the server actions the island imports dynamically. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { resolvePromo } from "@/lib/orders/promo-resolve";
import { createPurchase } from "@/lib/orders/purchase";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { addLine, removeLine, repriceAndValidate, updateLine } from "@/lib/pos/draft";
import { setTip } from "@/lib/pos/tip";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { actCartCheckoutCore, readCartCheckoutCore, type CartCheckoutDeps } from "./cart-checkout.core";
import type { CartCheckoutInput, CartCheckoutProps, CartCheckoutResult, CartData } from "./cart-checkout.types";
import { commandIdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import { publicOrigin, resolveStorefrontIdentity, storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<CartCheckoutDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [identity, origin, lang] = await Promise.all([resolveStorefrontIdentity(), publicOrigin(), storefrontLocale(locale)]);
  return {
    admin,
    runner: commandIdempotentRunner(admin),
    identity,
    locale: lang,
    origin,
    addLine,
    updateLine,
    removeLine,
    reprice: repriceAndValidate,
    resolvePromo: (client, input) => resolvePromo(client as SupabaseClient, input),
    setTip,
    ensureCustomer: (input, deps) => ensureCustomer(input, { admin: deps.admin as SupabaseClient }),
    createPurchase: (client, input) => createPurchase(client as SupabaseClient, input),
    createCheckout: (input) => createCheckoutSessionForTransaction(input),
  };
}

export async function readCartCheckout(
  tenantId: string,
  props: CartCheckoutProps,
): Promise<{ ok: true; data: CartData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readCartCheckoutCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.cartCheckout.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actCartCheckout(input: CartCheckoutInput, expectedVersion?: number): Promise<CartCheckoutResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actCartCheckoutCore(deps, input, expectedVersion);
  } catch (error) {
    logServerError("storefront.cartCheckout.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
