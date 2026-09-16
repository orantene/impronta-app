"use server";

/** package_selector — the server actions the island imports dynamically. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { livePhasePrice } from "@/lib/catalog/price-phases";
import { createPurchase } from "@/lib/orders/purchase";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { commandIdempotentRunner } from "./idempotent";
import { actPackageSelectorCore, readPackageSelectorCore, type PackageSelectorDeps } from "./package-selector.core";
import type { PackageSelectorData, PackageSelectorInput, PackageSelectorProps, PackageSelectorResult } from "./package-selector.types";
import { mapEngineRefusal } from "./refusals";
import { publicOrigin, resolveStorefrontIdentity, storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<PackageSelectorDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [identity, origin, lang] = await Promise.all([resolveStorefrontIdentity(), publicOrigin(), storefrontLocale(locale)]);
  return {
    admin,
    runner: commandIdempotentRunner(admin),
    identity,
    locale: lang,
    origin,
    livePrice: livePhasePrice,
    createPurchase: (client, input) => createPurchase(client as SupabaseClient, input),
    createCheckout: (input) => createCheckoutSessionForTransaction(input),
  };
}

export async function readPackageSelector(
  tenantId: string,
  props: PackageSelectorProps,
): Promise<{ ok: true; data: PackageSelectorData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readPackageSelectorCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.packageSelector.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actPackageSelector(input: PackageSelectorInput, _expectedVersion?: number): Promise<PackageSelectorResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actPackageSelectorCore(deps, input);
  } catch (error) {
    logServerError("storefront.packageSelector.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
