"use server";

/** order_lookup — the server actions the island imports dynamically. */

import { signAdmissionToken } from "@/lib/sessions/admission-token";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadTicketByCode, ticketLookup, ticketResend, ticketTransfer } from "@/lib/venues/ticket-self";

import { actOrderLookupCore, readOrderLookupCore, type OrderLookupDeps } from "./order-lookup.core";
import type { OrderLookupData, OrderLookupInput, OrderLookupProps, OrderLookupResult } from "./order-lookup.types";
import { mapEngineRefusal } from "./refusals";
import { storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<OrderLookupDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return {
    admin,
    locale: await storefrontLocale(locale),
    ticketLookup,
    loadTicketByCode,
    ticketResend,
    ticketTransfer,
    signAdmissionToken,
  };
}

export async function readOrderLookup(
  tenantId: string,
  props: OrderLookupProps,
): Promise<{ ok: true; data: OrderLookupData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readOrderLookupCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.orderLookup.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actOrderLookup(input: OrderLookupInput, _expectedVersion?: number): Promise<OrderLookupResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actOrderLookupCore(deps, input);
  } catch (error) {
    logServerError("storefront.orderLookup.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
