import "server-only";

/**
 * Tenant Registration Engine — join-policy resolver (S2).
 *
 * The single place that turns "this talent registered against tenant X" into a
 * row on agency_talent_roster, honoring the tenant's tenant_registration_settings:
 *
 *   mode 'open'      (enabled) → roster row status 'active'  (auto-accept)
 *   mode approval / exclusive  → roster row status 'pending' (awaits Manager+)
 *   closed / disabled / unset  → status 'pending' (non-regressing: preserves the
 *                                pre-engine ensureTalentRosterForNext behavior of
 *                                creating a pending request; the public CTA is
 *                                separately gated off, so closed workspaces just
 *                                won't surface the button — a stray request is
 *                                harmless and rejectable).
 *
 * Exclusivity is NOT applied here. Per the locked product decision, exclusive
 * mode ALWAYS routes through approval, and is_primary / exclusivity_status are
 * stamped at APPROVE time (S5) via resolveExclusivityForRosterAdd — never on a
 * self-service registration. So a pending row always lands is_primary=false.
 *
 * Reuses agency_talent_roster (no parallel request table) and respects its two
 * partial uniques (one live row per tenant+talent; one primary per talent) plus
 * the seat cap via checkRosterSeatAvailability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import {
  loadRegistrationSettings,
  type RegistrationSettings,
} from "@/lib/saas/registration-settings";
import { notifyRosterJoinRequested } from "@/lib/notifications/producers/roster-join-notify";

export type RegistrationOutcome =
  | {
      ok: true;
      /** Final roster status for this talent at this tenant. */
      status: "active" | "pending";
      /** True when a brand-new roster row was inserted (vs reactivated/kept). */
      created: boolean;
      /** Echoed so callers can branch success copy / notifications. */
      mode: RegistrationSettings["mode"];
    }
  | { ok: false; error: string };

/**
 * Apply the tenant's registration policy for a talent that just registered (or
 * signed in to apply) against this tenant. Idempotent: a repeat call reactivates
 * an inactive row and never duplicates a live one.
 */
export async function applyRegistrationPolicy(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    talentProfileId: string;
    userId: string;
    originDomain: string | null;
  },
): Promise<RegistrationOutcome> {
  const { tenantId, talentProfileId, userId, originDomain } = args;

  const settings = await loadRegistrationSettings(tenantId);
  const autoAccept = settings.enabled && settings.mode === "open";
  const targetStatus: "active" | "pending" = autoAccept ? "active" : "pending";
  const visibility = autoAccept ? settings.defaultRosterVisibility : "roster_only";

  const { data: existing, error: existingError } = await admin
    .from("agency_talent_roster")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();

  if (existingError) {
    logServerError("registration-policy.lookup", existingError);
    return { ok: false, error: "We couldn't process your request. Please try again." };
  }

  if (existing?.id) {
    // Never downgrade an already-active row; reactivate inactive ones; otherwise
    // keep the current status (e.g. an existing pending request stays pending).
    const nextStatus =
      existing.status === "active"
        ? "active"
        : existing.status === "inactive"
          ? targetStatus
          : existing.status;

    const update: Record<string, unknown> = {
      source_workspace_id: tenantId,
      origin_domain: originDomain,
    };
    if (nextStatus !== existing.status) update.status = nextStatus;
    if (autoAccept && nextStatus === "active") update.agency_visibility = visibility;

    const { error } = await admin
      .from("agency_talent_roster")
      .update(update)
      .eq("id", existing.id);
    if (error) {
      logServerError("registration-policy.update", error);
      return { ok: false, error: "We couldn't process your request. Please try again." };
    }
    const existingStatus: "active" | "pending" =
      nextStatus === "active" ? "active" : "pending";
    if (existingStatus === "pending") {
      void notifyRosterJoinRequested({ admin, tenantId, talentProfileId });
    }
    return { ok: true, status: existingStatus, created: false, mode: settings.mode };
  }

  // Fresh join — seat-check first (counts pending+active, fail-closed).
  const seat = await checkRosterSeatAvailability(admin, tenantId, 1);
  if (!seat.ok) {
    return { ok: false, error: seat.message };
  }

  const { error } = await admin.from("agency_talent_roster").insert({
    tenant_id: tenantId,
    talent_profile_id: talentProfileId,
    source_type: "freelancer_claimed",
    status: targetStatus,
    agency_visibility: visibility,
    hub_visibility_status: "not_submitted",
    is_primary: false,
    added_by: userId,
    source_workspace_id: tenantId,
    origin_domain: originDomain,
  });
  if (error) {
    logServerError("registration-policy.insert", error);
    return { ok: false, error: "We couldn't process your request. Please try again." };
  }

  if (targetStatus === "pending") {
    void notifyRosterJoinRequested({ admin, tenantId, talentProfileId });
  }
  return { ok: true, status: targetStatus, created: true, mode: settings.mode };
}
