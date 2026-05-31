"use server";

// ============================================================================
// talent-self-provision.ts — provisions a Basic talent profile for the
// signed-in user within an existing workspace (Phase 4 — Pure Workspace state).
//
// Called from <CreateMyTalentProfileDialog> when a workspace admin who has
// no talent profile wants to create one for themselves. The action:
//   1. Authenticates the caller (must be signed in).
//   2. Resolves the target tenant by slug (must be an existing workspace
//      the user belongs to).
//   3. Checks the user does NOT already have a talent_profiles row in the
//      tenant (idempotency — if exists, returns the existing profile_code).
//   4. Inserts: talent_profiles → agency_talent_roster.
//   5. The new talent_profile has user_id = current user so the talent
//      self-edit capability gate works (talent.profile.edit_self).
//
// Transactional safety: no client-side transactions in Supabase.
// On roster insert failure we roll back the orphaned talent_profiles row.
// ============================================================================

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

export type ProvisionTalentProfileSelfResult =
  | { ok: true; profileCode: string; talentProfileId: string }
  | { ok: false; error: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Idempotency check, scoped to the TARGET tenant.
 *
 * Returns the caller's talent profile only if it is already linked to *this*
 * tenant's roster. A user may legitimately have a self-profile in a different
 * workspace (the multi-agency / hybrid-workspace model) — that must NOT
 * short-circuit provisioning here, or a multi-workspace talent could never
 * create a profile in a second workspace: they'd be silently bounced to their
 * other workspace with nothing created, and the "create your talent page" CTA
 * would keep showing. So the lookup is joined through agency_talent_roster on
 * `tenantId`, not a bare `user_id` match on talent_profiles.
 */
async function findExistingTalentProfileForTenant(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  tenantId: string,
): Promise<{ profileCode: string; id: string } | null> {
  if (!admin) return null;

  // The caller's own (non-deleted) talent profiles. A user can have several —
  // one per workspace they've self-provisioned in.
  const { data: profiles, error: profErr } = await admin
    .from("talent_profiles")
    .select("id, profile_code")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (profErr) {
    logServerError("talent-self-provision.findExisting/profiles", profErr);
    return null;
  }
  if (!profiles || profiles.length === 0) return null;

  const ids = profiles.map((p) => p.id);

  // Only a profile already on THIS tenant's roster makes this a true
  // idempotent re-run for this workspace.
  const { data: rosterRow, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .in("talent_profile_id", ids)
    .limit(1)
    .maybeSingle();
  if (rosterErr) {
    // Fail open — allow creation rather than block the user on a read error.
    logServerError("talent-self-provision.findExisting/roster", rosterErr);
    return null;
  }
  if (!rosterRow) return null;

  const match = profiles.find(
    (p) => String(p.id) === String(rosterRow.talent_profile_id),
  );
  return match
    ? { profileCode: String(match.profile_code), id: String(match.id) }
    : null;
}

/**
 * The caller's own single live talent profile, if any — regardless of which
 * workspace(s) it is rostered in. The DB guarantees at most one
 * (partial unique index `idx_talent_profiles_one_live_user` on `user_id`
 * WHERE `deleted_at IS NULL`), so this is the profile we either REUSE (link
 * into a new workspace's roster) or, when absent, create fresh.
 *
 * Distinct from `findExistingTalentProfileForTenant`, which answers the
 * narrower idempotency question "is the caller already on THIS tenant's
 * roster?". This answers "does the caller have a talent identity at all?".
 */
async function findOwnLiveTalentProfile(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<{ profileCode: string; id: string } | null> {
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, profile_code")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("talent-self-provision.findOwnLive", error);
    return null;
  }
  return data
    ? { profileCode: String(data.profile_code), id: String(data.id) }
    : null;
}

// ── Main action ──────────────────────────────────────────────────────────────

export async function provisionTalentProfileSelf(params: {
  tenantSlug: string;
  displayName: string;
}): Promise<ProvisionTalentProfileSelfResult> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    return { ok: false, error: "You must be signed in." };
  }
  const userId = session.user.id;

  // ── Resolve tenant ────────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(params.tenantSlug);
  if (!scope) {
    return { ok: false, error: "Workspace not found." };
  }
  const tenantId = scope.tenantId;

  // ── Must have at least admin capability in this workspace ─────────────────
  const canEdit = await userHasCapability("agency.roster.edit", tenantId);
  if (!canEdit) {
    return { ok: false, error: "You don't have permission to create a talent profile in this workspace." };
  }

  // ── Validate display name ─────────────────────────────────────────────────
  const displayName = params.displayName.trim();
  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }
  if (displayName.length > 120) {
    return { ok: false, error: "Display name must be 120 characters or fewer." };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Service unavailable. Please try again in a moment." };
  }

  // ── Idempotency: return existing only if already provisioned in THIS tenant ─
  const existing = await findExistingTalentProfileForTenant(admin, userId, tenantId);
  if (existing) {
    return { ok: true, profileCode: existing.profileCode, talentProfileId: existing.id };
  }

  // ── Seat check (a LINK or a CREATE both consume one roster seat) ──────────
  const seats = await checkRosterSeatAvailability(admin, tenantId, 1);
  if (!seats.ok) {
    return { ok: false, error: seats.message };
  }

  // ── One-live-profile-per-user invariant: link, don't duplicate ────────────
  // The DB enforces at most ONE live talent_profile per user account (partial
  // unique index `idx_talent_profiles_one_live_user`). A caller who is already
  // a talent in another workspace therefore CANNOT get a second profile — a
  // plain insert fails with 23505 (the bug this branch fixes). The canonical
  // multi-workspace mechanism is the roster join table, so when the caller
  // already has a live profile we LINK it into THIS workspace's roster instead
  // of creating a new one. Only a caller with no live profile at all reaches
  // the create branch below. The typed displayName is honored only on create;
  // an existing profile keeps its own identity across every workspace.
  const ownProfile = await findOwnLiveTalentProfile(admin, userId);
  if (ownProfile) {
    const linkOriginDomain = (await headers()).get("host")?.toLowerCase() ?? null;
    const { error: linkErr } = await admin.from("agency_talent_roster").insert({
      tenant_id:           tenantId,
      source_workspace_id: tenantId,
      origin_domain:       linkOriginDomain,
      talent_profile_id:   ownProfile.id,
      source_type:         "agency_created",
      status:              "active",
      agency_visibility:   "roster_only",
      added_by:            userId,
    });
    if (linkErr) {
      logServerError("talent-self-provision.linkRoster", linkErr);
      return { ok: false, error: "Could not add your talent profile to this workspace. Please try again." };
    }
    revalidatePath(`/${params.tenantSlug}/admin/roster`);
    return { ok: true, profileCode: ownProfile.profileCode, talentProfileId: ownProfile.id };
  }

  // ── Create branch: no existing profile → allocate code via DB RPC ─────────
  const { data: codeRow, error: codeErr } = await admin.rpc("generate_profile_code");
  if (codeErr || !codeRow) {
    logServerError("talent-self-provision.generateCode", codeErr);
    return { ok: false, error: "Could not allocate a profile code. Please try again." };
  }
  const profileCode = String(codeRow);

  // ── Insert talent_profiles ─────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await admin
    .from("talent_profiles")
    .insert({
      profile_code:      profileCode,
      display_name:      displayName,
      user_id:           userId,
      workflow_status:   "draft",
      visibility:        "hidden",
      membership_tier:   "free",
      membership_status: "active",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    logServerError("talent-self-provision.insertProfile", insertErr);
    return { ok: false, error: "Could not create your talent profile. Please try again." };
  }

  const talentProfileId = String(inserted.id);
  const originDomain = (await headers()).get("host")?.toLowerCase() ?? null;

  // ── Insert agency_talent_roster (links to this workspace) ────────────────
  const { error: rosterErr } = await admin.from("agency_talent_roster").insert({
    tenant_id:           tenantId,
    source_workspace_id: tenantId,
    origin_domain:       originDomain,
    talent_profile_id:   talentProfileId,
    source_type:         "agency_created",
    status:              "active",
    agency_visibility:   "roster_only",
    added_by:            userId,
  });

  if (rosterErr) {
    logServerError("talent-self-provision.insertRoster", rosterErr);
    // Roll back the orphaned talent_profiles row
    await admin.from("talent_profiles").delete().eq("id", talentProfileId);
    return { ok: false, error: "Could not link your profile to the workspace. Please try again." };
  }

  revalidatePath(`/${params.tenantSlug}/admin/roster`);

  return { ok: true, profileCode, talentProfileId };
}
