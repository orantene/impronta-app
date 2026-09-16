"use server";

/**
 * class_timetable — the server actions the island imports dynamically.
 * Thin: bind the request and the engines, delegate to the core.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPurchase } from "@/lib/orders/purchase";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { acceptWaitlistOffer } from "@/lib/scheduling/session-waitlist";
import { joinWaitlist } from "@/lib/scheduling/waitlist-desk";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { actClassTimetableCore, readClassTimetableCore, type ClassTimetableDeps } from "./class-timetable.core";
import type {
  ClassTimetableData,
  ClassTimetableInput,
  ClassTimetableProps,
  ClassTimetableResult,
} from "./class-timetable.types";
import { commandIdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import { publicOrigin, resolveStorefrontIdentity, storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<ClassTimetableDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [identity, origin, lang] = await Promise.all([
    resolveStorefrontIdentity(),
    publicOrigin(),
    storefrontLocale(locale),
  ]);
  return {
    admin,
    runner: commandIdempotentRunner(admin),
    identity,
    locale: lang,
    origin,
    createPurchase: (client, input) => createPurchase(client as SupabaseClient, input),
    createCheckout: (input) => createCheckoutSessionForTransaction(input),
    joinWaitlist: (client, input) => joinWaitlist(client as SupabaseClient, input),
    acceptWaitlistOffer: (client, input) => acceptWaitlistOffer(client as SupabaseClient, input),
  };
}

export async function readClassTimetable(
  tenantId: string,
  props: ClassTimetableProps,
): Promise<{ ok: true; data: ClassTimetableData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readClassTimetableCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.classTimetable.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actClassTimetable(
  input: ClassTimetableInput,
  _expectedVersion?: number,
): Promise<ClassTimetableResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actClassTimetableCore(deps, input);
  } catch (error) {
    logServerError("storefront.classTimetable.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
