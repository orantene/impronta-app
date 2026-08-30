/**
 * Exclusive-release (external_booking_released) is an agency contract right.
 * Owner/admin only. No new capability — manage_agency_settings already
 * means that pair.
 */

import { roleGrantsCapability, type TenantRoleKey } from "@/lib/access";

export const EXCLUSIVE_RELEASE_CAPABILITY = "manage_agency_settings" as const;

export const EXCLUSIVE_RELEASE_DENIED =
  "Only an owner or admin can allow bookings outside our site.";

export function roleCanFlipExclusiveRelease(role: TenantRoleKey): boolean {
  return roleGrantsCapability(role, EXCLUSIVE_RELEASE_CAPABILITY);
}

export function exclusiveReleaseFromStaffAuth(
  auth: { ok: true } | { ok: false; error: string },
): { ok: true } | { ok: false; error: string } {
  if (!auth.ok) return { ok: false, error: EXCLUSIVE_RELEASE_DENIED };
  return { ok: true };
}
