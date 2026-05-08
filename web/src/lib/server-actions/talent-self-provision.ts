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

/** Derive an initial display name from auth user metadata + email fallback. */
function deriveDisplayNameFromUser(user: {
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}): string {
  const meta = user.user_metadata ?? {};
  const full =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (full) return full;
  // Fall back to email local-part
  const email = user.email ?? "";
  const localPart = email.split("@")[0] ?? "";
  // Humanise: replace dots/underscores/hyphens with spaces, capitalise each word
  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "My Talent Profile";
}

/** Derive a URL-safe slug candidate from a display name. */
function deriveSlugFromDisplayName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "talent";
}

/** Check whether the user already has a talent_profiles row for a given tenant. */
async function findExistingTalentProfile(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  tenantId: string,
): Promise<{ profileCode: string; id: string } | null> {
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, profile_code")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("talent-self-provision.findExisting", error);
    return null;
  }
  if (!data) return null;

  // Confirm this profile is on the target tenant's roster
  const { data: rosterRow, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", data.id)
    .is("deleted_at" as never, null)
    .limit(1)
    .maybeSingle();

  if (rosterErr) {
    logServerError("talent-self-provision.findExisting/roster", rosterErr);
  }

  // Return the profile even if roster row missing — the profile exists
  if (data) {
    return { profileCode: String(data.profile_code), id: String(data.id) };
  }
  return null;
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

  // ── Idempotency: return existing if already provisioned ───────────────────
  const existing = await findExistingTalentProfile(admin, userId, tenantId);
  if (existing) {
    return { ok: true, profileCode: existing.profileCode, talentProfileId: existing.id };
  }

  // ── Seat check ────────────────────────────────────────────────────────────
  const seats = await checkRosterSeatAvailability(admin, tenantId, 1);
  if (!seats.ok) {
    return { ok: false, error: seats.message };
  }

  // ── Allocate profile code via DB RPC (same as admin-created flow) ─────────
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
