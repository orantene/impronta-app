import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { offeringWhereFromAttributes } from "@/lib/talent/offering-request-detail";

import { cleanEventLocation } from "./booking-event-location";
import {
  composeLocationText,
  serviceAddressRule,
  validateServiceAddress,
  type ServiceAddressErrorCode,
  type ServiceAddressInput,
} from "./service-address";

/**
 * TUL-436: the server-side word on a service address. The offering's own
 * `attributes.where` decides whether an address is required; the sheet is a
 * convenience, never the authority. Pure core in `resolveBookingLocation`.
 */
export type BookingLocationResult =
  | { ok: true; eventLocation: string | null }
  | { ok: false; error: ServiceAddressErrorCode };

export function resolveBookingLocation(args: {
  where: Parameters<typeof serviceAddressRule>[0];
  serviceAddress?: ServiceAddressInput | null;
  sheetLabel?: string | null;
}): BookingLocationResult {
  const rule = serviceAddressRule(args.where);
  if (rule === "hidden") return { ok: true, eventLocation: cleanEventLocation(args.sheetLabel) };
  const input = args.serviceAddress ?? {};
  const checked = validateServiceAddress(input, rule);
  if (!checked.ok) return checked;
  return { ok: true, eventLocation: composeLocationText(input) ?? cleanEventLocation(args.sheetLabel) };
}

export async function loadOfferingWhere(offeringId: string | null | undefined) {
  if (!offeringId) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin.from("talent_offerings").select("attributes").eq("id", offeringId).maybeSingle();
  // Fail open on a read error: the sheet already asked, and the stamp falls back to settings.
  if (error) logServerError("service-address/offering", error);
  return offeringWhereFromAttributes((data as { attributes?: Record<string, unknown> | null } | null)?.attributes ?? null);
}
