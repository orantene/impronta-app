"use server";

/**
 * Canonical workspace roster — talent profile edit actions.
 *
 * Auth pattern: getCachedActorSession + getTenantScopeBySlug + userHasCapability.
 * Security boundary: talent must be on this tenant's roster (checked before any write).
 *
 * Handles:
 *  - setRosterTalentSiteVisibility — roster-card eye toggle
 *
 * TUL-1269: the retired editor's actions (updateRosterTalentProfile,
 * registerRosterTalentPhoto, updateRosterTalentWorkflow) were removed. They were
 * dead but directly callable; updateRosterTalentProfile wrote phone/DOB
 * unconditionally.
 */

import { revalidatePath } from "next/cache";
import { auditTalentEvent } from "@/lib/audit/emit";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { notifyTalentProfileApproved } from "@/lib/notifications/producers/talent-profile-approved-notify";
import { assertTalentReadyForPublicListing } from "@/lib/field-engine/profile-publish-server-gate";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { afterResponse } from "@/lib/server/after-response";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RosterTalentEditState =
  | { error: string; success?: never }
  | { success: true; error?: never }
  | undefined;

// ─── Guard: resolve scope, check capability, verify roster membership ─────────

async function resolveEditContext(tenantSlug: string, talentId: string) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { ok: false as const, error: "You don't have permission to edit talent." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Server configuration error." };

  // Security: confirm this talent is actually on this tenant's roster.
  const { data: rosterRow, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("id, status, agency_visibility")
    .eq("tenant_id", scope.tenantId)
    .eq("talent_profile_id", talentId)
    .neq("status", "removed")
    .maybeSingle();

  if (rosterErr) {
    logServerError("roster/[id].resolveEditContext/rosterCheck", rosterErr);
    return { ok: false as const, error: "Could not verify roster membership." };
  }
  if (!rosterRow) return { ok: false as const, error: "Talent is not on your roster." };

  return {
    ok: true as const,
    admin,
    tenantId: scope.tenantId,
    userId: session.user.id,
    rosterRowId: (rosterRow as { id: string }).id,
    currentAgencyVisibility: (rosterRow as { agency_visibility: string }).agency_visibility,
  };
}

// ─── Agency directory visibility — the roster-card "eye" toggle ──────────────

/**
 * Flip a roster talent's agency directory visibility.
 *
 *   visible = true  → agency_visibility = 'site_visible'
 *                     (listed in this agency's directory + search + public page)
 *   visible = false → agency_visibility = 'roster_only'
 *                     (kept on the roster, not shown publicly)
 *
 * This is the agency-side public gate that replaces the old Draft/Published
 * workflow, and since 20260803203521 it is the sole input to
 * `talent_profiles.is_publicly_listed` — the column the directory, the Discover
 * matview and the media RLS policy all read. Flipping the eye on is therefore
 * the real approve action, so it clears the same publish checklist the drawer's
 * Publish button enforces.
 *
 * A talent whose `is_publicly_hidden` is true stays hidden publicly regardless —
 * that global kill-switch belongs to the talent, not the agency.
 */
export async function setRosterTalentSiteVisibility(
  tenantSlug: string,
  talentId: string,
  visible: boolean,
): Promise<RosterTalentEditState> {
  await requireNotImpersonating();
  const ctx = await resolveEditContext(tenantSlug, talentId);
  if (!ctx.ok) return { error: ctx.error };

  const { admin, userId, tenantId, rosterRowId, currentAgencyVisibility } = ctx;
  const next = visible ? "site_visible" : "roster_only";

  // 'featured' already counts as visible — don't demote a featured talent
  // just because the eye was clicked "on".
  if (visible && currentAgencyVisibility === "featured") return { success: true };
  if (currentAgencyVisibility === next) return { success: true };

  // Publish checklist — only when going public. Hiding is always allowed, and
  // must stay allowed: an agency has to be able to pull an incomplete profile
  // down without first filling in the fields that made it incomplete.
  if (visible) {
    const ready = await assertTalentReadyForPublicListing({
      supabase: admin,
      tenantId,
      talentProfileId: talentId,
    });
    if (!ready.ok) return { error: ready.error };
  }

  const { error } = await admin
    .from("agency_talent_roster")
    .update({ agency_visibility: next })
    .eq("id", rosterRowId);

  if (error) {
    logServerError("roster/[id].setRosterTalentSiteVisibility", error);
    return { error: "Could not update visibility. Try again." };
  }

  try {
    await admin.from("talent_workflow_events").insert({
      tenant_id: tenantId,
      talent_profile_id: talentId,
      actor_user_id: userId,
      event_type: "agency_visibility_changed",
      payload: { from: currentAgencyVisibility, to: next, note: "roster eye toggle" },
    });
  } catch (e) {
    logServerError("roster/[id].setRosterTalentSiteVisibility/events", e);
  }

  // talent.profile_approved (spec §6.3) — the talent just became site-visible
  // (from a non-visible, non-featured state, per the early returns above), so
  // their profile is now discoverable to clients. Fire-and-forget; deduped per
  // tenant+talent so re-toggling the eye won't re-email.
  if (visible) {
    afterResponse(() => notifyTalentProfileApproved({ admin, tenantId, talentProfileId: talentId }));
  }

  auditTalentEvent(
    tenantId,
    "roster",
    "roster.talent.visibility_changed",
    talentId,
    (name) =>
      visible
        ? `${name ?? "A talent"} is now shown on the public site`
        : `${name ?? "A talent"} is now hidden from the public site`,
    { metadata: { from: currentAgencyVisibility, to: next } },
  );

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  revalidateDirectoryListing();
  return { success: true };
}
