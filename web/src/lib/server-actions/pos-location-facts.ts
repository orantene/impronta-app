"use server";

/**
 * The facts Settings › POS (W20) and Settings › Locations (W23) draw for the
 * workspace's ONE location: its name and clock, the drawer, the card reader.
 *
 * The place name and clock prefer `venue_locations` (D-POS-76). Drawer and
 * reader facts stay on `pos_shifts` and the platform Stripe Terminal env.
 * A fact that cannot be read says so with its own `null`.
 *
 * NEVER RETURNS A SECRET. The reader fact is `computeProviderStatuses`'
 * boolean and reason code, never the reader id or the key.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { loadDefaultVenue, resolveTenantTimezone } from "@/lib/spaces/venues";
import { currentShift } from "@/lib/pos/shift";
import { computeProviderStatuses, readProviderStatusEnv, type ProviderReason } from "@/lib/payments/provider-status";
import { readPosModes } from "@/lib/pos/pos-modes-store";
import type { PosMode } from "@/lib/pos/modes";
import type { PaymentProviderRefusal } from "@/lib/settings/refusals";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type PosLocationFacts = {
  workspaceName: string;
  /** The default venue's name, or "" when none is saved yet. */
  venueName: string;
  /** "Reforma 12 · Mexico City" or "" when no address is saved. */
  addressLine: string;
  timezone: string;
  /** Which rung of the timezone ladder answered. */
  timezoneSource: string;
  /** The modes this location has on. `null` when the settings blob could not be read. */
  modes: PosMode[] | null;
  /** The one drawer: the open shift, or `null` when none is open; `unreadable` when `pos_shifts` did not answer. */
  drawer: { openedAt: string | null; floatCents: number } | null | "unreadable";
  reader: { configured: boolean; reason: ProviderReason };
  onlineCard: { configured: boolean; reason: ProviderReason };
};

export type PosLocationFactsResult =
  | { ok: true; facts: PosLocationFacts }
  | { ok: false; reason: PaymentProviderRefusal };

export async function getPosLocationFacts(): Promise<PosLocationFactsResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    logServerError("pos-location-facts.denied", auth.error);
    return { ok: false, reason: "not_allowed" };
  }
  const { supabase, tenantId } = auth;

  const [venue, resolved, shift, modes, agency, defaultLocation] = await Promise.all([
    loadDefaultVenue(tenantId),
    resolveTenantTimezone(tenantId),
    currentShift(supabase, { tenantId }),
    readPosModes(supabase, tenantId),
    // eslint-disable-next-line ratchet/no-untenanted-from -- agencies is the tenant table; looked up by its primary key, the session's own tenantId
    supabase.from("agencies").select("display_name").eq("id", tenantId).maybeSingle(),
    tenantScopedQuery(supabase, "venue_locations", tenantId)
      .select("name, timezone, address, slug")
      .eq("is_default", true)
      .maybeSingle(),
  ]);
  if (agency.error) logServerError("pos-location-facts.agency", agency.error);
  if (defaultLocation.error) logServerError("pos-location-facts.venue_locations", defaultLocation.error);

  const providers = computeProviderStatuses(readProviderStatusEnv());
  const reader = providers.find((p) => p.id === "stripe_terminal");
  const online = providers.find((p) => p.id === "stripe_checkout");

  const loc = defaultLocation.data as
    | { name?: string | null; timezone?: string | null; address?: Record<string, unknown> | null }
    | null;
  const locAddress = loc?.address && typeof loc.address === "object" ? loc.address : null;
  const locLine =
    typeof locAddress?.line === "string"
      ? locAddress.line.trim()
      : [typeof locAddress?.line1 === "string" ? locAddress.line1.trim() : "", typeof locAddress?.city === "string" ? locAddress.city.trim() : ""]
          .filter(Boolean)
          .join(" · ");
  const addressParts = locLine
    ? [locLine]
    : [venue?.address_line1?.trim(), venue?.city?.trim()].filter((p): p is string => Boolean(p));

  return {
    ok: true,
    facts: {
      workspaceName: (agency.data as { display_name?: string | null } | null)?.display_name ?? "",
      venueName: loc?.name?.trim() || venue?.name || "",
      addressLine: addressParts.join(" · "),
      timezone: loc?.timezone?.trim() || resolved.timezone,
      timezoneSource: loc?.timezone?.trim() ? "venue_locations" : resolved.source,
      modes,
      drawer: shift.ok
        ? shift.shift
          ? { openedAt: shift.shift.openedAt, floatCents: shift.shift.openingCashCents }
          : null
        : "unreadable",
      reader: { configured: reader?.configured ?? false, reason: reader?.reason ?? "missing_secret_key" },
      onlineCard: { configured: online?.configured ?? false, reason: online?.reason ?? "missing_secret_key" },
    },
  };
}
