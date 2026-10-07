import "server-only";

/**
 * Who may write a talent's offerings: the talent themself, or staff of a
 * workspace that has them on its roster. Moved out of offerings-actions.ts
 * (WSF B2) so the narrow booking-rules action shares the exact same check.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveDefaultCurrencyForUI } from "@/lib/billing/currencies";
import {
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  parseSellingBookingSettings,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";

export type AuthResult =
  | {
      ok: true;
      userId: string;
      isStaff: boolean;
      defaultCurrency: string;
      tenantId: string | null;
      /** The talent's primary content language (`preferred_locale`), "en" when unset. */
      primaryLocale: string;
    }
  | { ok: false; error: string };

/** A stored `preferred_locale` as a bare language code; "en" when unset or malformed. */
export function normalizePrimaryLocale(raw: unknown): string {
  if (typeof raw !== "string") return "en";
  const code = raw.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return /^[a-z]{2,3}$/.test(code) ? code : "en";
}

export async function authorizeForTalent(talentProfileId: string): Promise<AuthResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  // The staff check does not depend on the profile row, so start it alongside.
  const staffPending = requireWorkspaceStaffAction();
  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id, user_id, default_currency, preferred_locale")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !tp) {
    void staffPending.catch(() => {});
    if (error) logServerError("talent.offerings.authorize", error);
    return { ok: false, error: "Profile not found." };
  }

  const isOwner = tp.user_id === session.user.id;

  // Prefer the active workspace when the actor is staff/owner there and the
  // talent is on that roster. is_primary-first inference would pin a studio
  // owner's new offerings to their exclusive agency.
  const staff = await staffPending;
  let isStaff = false;
  let staffTenantId: string | null = null;
  if (staff.ok) {
    const adminForCheck = createServiceRoleClient();
    if (!adminForCheck) return { ok: false, error: "Server configuration error." };
    const { data: rosterRow, error: rosterError } = await adminForCheck
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", staff.tenantId)
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed")
      .maybeSingle();
    // Same outcome as before for a failed read (no roster row), now logged.
    if (rosterError) logServerError("talent.offerings.authorize.roster", rosterError);
    if (rosterRow) {
      isStaff = !isOwner;
      staffTenantId = staff.tenantId;
    } else if (!isOwner) {
      return { ok: false, error: "Talent not on this roster." };
    }
  } else if (!isOwner) {
    return { ok: false, error: "Forbidden." };
  }

  let tenantId: string | null = staffTenantId;
  const admin = createServiceRoleClient();
  if (admin && !tenantId) {
    const { data: rosterRows, error: rostersError } = await admin
      .from("agency_talent_roster")
      .select("tenant_id, is_primary")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "active");
    if (rostersError) logServerError("talent.offerings.authorize.tenant", rostersError);
    const rows = (rosterRows ?? []) as { tenant_id: string; is_primary: boolean }[];
    rows.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    tenantId = rows[0]?.tenant_id ?? null;
  }

  return {
    ok: true,
    userId: session.user.id,
    isStaff,
    defaultCurrency: resolveDefaultCurrencyForUI(tp.default_currency),
    tenantId,
    primaryLocale: normalizePrimaryLocale(tp.preferred_locale),
  };
}

/**
 * The talent's default booking posture, read server-side (never trusted from
 * the client). Used to validate services that inherit it (WSF B2).
 */
export async function loadTalentDefaultPosture(talentProfileId: string): Promise<TalentBookingPosture> {
  const admin = createServiceRoleClient();
  if (!admin) return PLATFORM_DEFAULT_BOOKING_POSTURE;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("selling_defaults")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent.offerings.defaultPosture", error);
    return PLATFORM_DEFAULT_BOOKING_POSTURE;
  }
  return parseSellingBookingSettings((data as { selling_defaults?: unknown } | null)?.selling_defaults ?? {}).bookingPosture;
}
