"use server";

/**
 * appointment_picker — the server actions the island imports dynamically.
 *
 * Thin on purpose: resolve the request (client, identity, origin, locale),
 * bind the real engines, delegate to the core. A static import of this file
 * from a client component would pull the engines into the bundle; the island
 * does `await import("@/lib/storefront/appointment-picker.server")` on mount,
 * exactly as `reserve-table-island` does with its action.
 *
 * NO NEW SURFACE. A server action posts to the page's own URL, so nothing in
 * `surface-allow-list` or `SHARED_API_PREFIXES` changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRosterPortraitsByIds } from "@/lib/home/default-storefront-roster";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { signBookingManageToken } from "@/lib/bookings/manage-token";
import { placeInstantPurchase } from "@/lib/scheduling/instant-purchase";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import { loadPublicBookableOfferings } from "@/lib/site-admin/server/load-book-page-offerings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import {
  actAppointmentPickerCore,
  readAppointmentPickerCore,
  type AppointmentPickerDeps,
} from "./appointment-picker.core";
import type {
  AppointmentPickerData,
  AppointmentPickerInput,
  AppointmentPickerProps,
  AppointmentPickerResult,
} from "./appointment-picker.types";
import { commandIdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import { publicOrigin, resolveStorefrontIdentity, storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<AppointmentPickerDeps | null> {
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
    loadOfferings: (tenantId, lc) =>
      loadPublicBookableOfferings({ tenantId, locale: lc, host: { kind: "agency", tenantId } }),
    loadPortraits: async (tenantId, ids) => {
      const rows = await loadRosterPortraitsByIds(tenantId, ids);
      return new Map(rows.filter((r) => r.thumb).map((r) => [r.id, r.thumb as string]));
    },
    loadBusy: (input) => loadBusyIntervals({ ...input, admin: input.admin as SupabaseClient }),
    placePurchase: (client, input) => placeInstantPurchase(client as SupabaseClient, input),
    createCheckout: (input) => createCheckoutSessionForTransaction(input),
    signManageToken: signBookingManageToken,
  };
}

export async function readAppointmentPicker(
  tenantId: string,
  props: AppointmentPickerProps,
): Promise<{ ok: true; data: AppointmentPickerData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readAppointmentPickerCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.appointmentPicker.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actAppointmentPicker(
  input: AppointmentPickerInput,
  _expectedVersion?: number,
): Promise<AppointmentPickerResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actAppointmentPickerCore(deps, input);
  } catch (error) {
    logServerError("storefront.appointmentPicker.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
