"use server";

/**
 * Venue settings — the workspace's place and its clock.
 *
 * WHY THIS EXISTS AT ALL: S1 gave the platform a venue with a timezone and one
 * function to resolve it, and then every workspace in production stayed on UTC,
 * because there was nowhere to change it. A column nobody can set is a column
 * nobody will ever set. This is that screen's server half.
 *
 * Scope is deliberately the default venue only. Multiple venues per workspace
 * are in the model and not yet in the UI; adding a second venue is S2's job,
 * where it arrives beside the rooms and tables that hang off it.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import {
  loadDefaultVenue,
  resolveTenantTimezone,
  saveDefaultVenue,
  type VenueRow,
} from "@/lib/spaces/venues";
import type { TimezoneSource } from "@/lib/spaces/venue-timezone";

export type VenueSettings = {
  id: string | null;
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  timezone: string;
};

export type LoadVenueSettingsResult =
  | {
      ok: true;
      venue: VenueSettings;
      /** What the platform currently resolves to, and which rung answered. */
      resolved: { timezone: string; source: TimezoneSource };
    }
  | { ok: false; error: string };

export type SaveVenueSettingsResult =
  | { ok: true; venue: VenueSettings; resolved: { timezone: string; source: TimezoneSource } }
  | { ok: false; error: string };

const MAX_LEN = 200;

function trimmed(v: unknown, max = MAX_LEN): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function toSettings(row: VenueRow | null): VenueSettings {
  return {
    id: row?.id ?? null,
    name: row?.name ?? "",
    addressLine1: row?.address_line1 ?? "",
    addressLine2: row?.address_line2 ?? "",
    city: row?.city ?? "",
    region: row?.region ?? "",
    postalCode: row?.postal_code ?? "",
    countryCode: row?.country_code ?? "",
    timezone: row?.timezone ?? "UTC",
  };
}

export async function loadVenueSettings(tenantSlug: string): Promise<LoadVenueSettingsResult> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: "Not allowed." };
  if (staff.tenantSlug !== tenantSlug.trim().toLowerCase()) {
    return { ok: false, error: "Not allowed." };
  }
  const row = await loadDefaultVenue(staff.tenantId);
  const resolved = await resolveTenantTimezone(staff.tenantId);
  return { ok: true, venue: toSettings(row), resolved };
}

export async function updateVenueSettings(
  tenantSlug: string,
  input: {
    name: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
    countryCode: string;
    timezone: string;
  },
): Promise<SaveVenueSettingsResult> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: "Not allowed." };
  if (staff.tenantSlug !== tenantSlug.trim().toLowerCase()) {
    return { ok: false, error: "Not allowed." };
  }

  const name = trimmed(input.name);
  if (!name) return { ok: false, error: "Give the venue a name." };

  // The zone is validated inside saveDefaultVenue too. This is not belt and
  // braces for its own sake: the storage layer is the one that must refuse,
  // and this copy only exists to keep the message next to the form.
  const saved = await saveDefaultVenue(staff.tenantId, {
    name,
    address_line1: trimmed(input.addressLine1) || null,
    address_line2: trimmed(input.addressLine2) || null,
    city: trimmed(input.city) || null,
    region: trimmed(input.region) || null,
    postal_code: trimmed(input.postalCode, 40) || null,
    country_code: trimmed(input.countryCode, 8).toUpperCase() || null,
    timezone: trimmed(input.timezone, 80),
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  revalidatePath(`/${tenantSlug}/admin`);

  const resolved = await resolveTenantTimezone(staff.tenantId);
  return { ok: true, venue: toSettings(saved.venue), resolved };
}
