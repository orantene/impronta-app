"use server";

/**
 * The facts Settings › POS (W20) and Settings › Locations (W23) draw for the
 * workspace's ONE location: its name and clock, the drawer, the card reader.
 *
 * WHY "LOCATION" MEANS "WORKSPACE". There is no locations table
 * (`lib/pos/modes.ts` header; D-POS-58). The default venue is the place, the
 * workspace's timezone ladder is the clock, `pos_shifts` is the one drawer,
 * and the platform's Stripe Terminal reader (an env var, never a per-tenant
 * key) is the one reader. Everything here is read; nothing is invented, and
 * a fact that cannot be read says so with its own `null`.
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

  const [venue, resolved, shift, modes, agency] = await Promise.all([
    loadDefaultVenue(tenantId),
    resolveTenantTimezone(tenantId),
    currentShift(supabase, { tenantId }),
    readPosModes(supabase, tenantId),
    // eslint-disable-next-line ratchet/no-untenanted-from -- agencies is the tenant table; looked up by its primary key, the session's own tenantId
    supabase.from("agencies").select("display_name").eq("id", tenantId).maybeSingle(),
  ]);
  if (agency.error) logServerError("pos-location-facts.agency", agency.error);

  const providers = computeProviderStatuses(readProviderStatusEnv());
  const reader = providers.find((p) => p.id === "stripe_terminal");
  const online = providers.find((p) => p.id === "stripe_checkout");

  const addressParts = [venue?.address_line1?.trim(), venue?.city?.trim()].filter((p): p is string => Boolean(p));

  return {
    ok: true,
    facts: {
      workspaceName: (agency.data as { display_name?: string | null } | null)?.display_name ?? "",
      venueName: venue?.name ?? "",
      addressLine: addressParts.join(" · "),
      timezone: resolved.timezone,
      timezoneSource: resolved.source,
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
