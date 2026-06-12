"use server";

// ============================================================================
// talent-workspace-provision.ts — provisions a free workspace for a
// talent-only user (Phase 3 — Pure Talent state).
//
// Called from <StartFreeWorkspaceDialog> when a talent who has no workspace
// membership wants to create one. The action:
//   1. Authenticates the caller (must be signed in).
//   2. Verifies the caller has a talent_profiles row (in any tenant).
//   3. Validates + checks slug availability.
//   4. Inserts: agencies → agency_memberships → agency_domains.
//
// Transactional safety: Supabase does not expose client-side transactions.
// We use a manual rollback approach: if any step after agency creation fails,
// we attempt to delete the agencies row before returning an error. The
// agency_domains insert is best-effort; on failure we log and return the
// slug so the caller can retry the domain-seed step (rare path).
// ============================================================================

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  normalizeWorkspaceSlugCandidate,
  isReservedWorkspaceSlug,
  WORKSPACE_SLUG_MAX_LENGTH,
  WORKSPACE_SLUG_REGEX,
} from "@/lib/saas/workspace-signup";
import { isReservedSlug } from "@/lib/site-admin/reserved-routes";
import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";

export type ProvisionFreeWorkspaceResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

async function isSlugTaken(admin: ReturnType<typeof createServiceRoleClient>, slug: string): Promise<boolean> {
  if (!admin) return true;
  const { data, error } = await admin
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logServerError("talent-workspace-provision.isSlugTaken", error);
    return true; // treat error as taken for safety
  }
  return data !== null;
}

async function hasTalentProfile(admin: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<boolean> {
  if (!admin) return false;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("talent-workspace-provision.hasTalentProfile", error);
    return false;
  }
  return data !== null;
}

async function rollbackAgency(admin: ReturnType<typeof createServiceRoleClient>, agencyId: string): Promise<void> {
  if (!admin) return;
  const { error } = await admin.from("agencies").delete().eq("id", agencyId);
  if (error) {
    logServerError("talent-workspace-provision.rollbackAgency", error);
  }
}

export async function provisionFreeWorkspaceFromTalent(params: {
  workspaceName: string;
  slug: string;
  location: string;
}): Promise<ProvisionFreeWorkspaceResult> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    return { ok: false, error: "You must be signed in." };
  }
  const userId = session.user.id;

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Service unavailable. Please try again in a moment." };
  }

  // ── Must have a talent profile somewhere ──────────────────────────────────
  const isTalent = await hasTalentProfile(admin, userId);
  if (!isTalent) {
    return { ok: false, error: "Only talent accounts can use this shortcut." };
  }

  // ── Validate inputs ───────────────────────────────────────────────────────
  const displayName = params.workspaceName.trim();
  if (!displayName) {
    return { ok: false, error: "Workspace name is required." };
  }
  if (displayName.length > 120) {
    return { ok: false, error: "Workspace name must be 120 characters or fewer." };
  }

  const rawSlug = params.slug.trim().toLowerCase();
  const normalizedSlug = normalizeWorkspaceSlugCandidate(rawSlug);

  if (!normalizedSlug) {
    return { ok: false, error: "Slug is required." };
  }
  if (!WORKSPACE_SLUG_REGEX.test(normalizedSlug)) {
    return { ok: false, error: "Slug must be 2–32 lowercase letters, numbers, or hyphens, not starting or ending with a hyphen." };
  }
  if (normalizedSlug.length > WORKSPACE_SLUG_MAX_LENGTH) {
    return { ok: false, error: `Slug must be ${WORKSPACE_SLUG_MAX_LENGTH} characters or fewer.` };
  }
  if (isReservedWorkspaceSlug(normalizedSlug) || isReservedSlug(normalizedSlug)) {
    return { ok: false, error: "That slug is reserved. Please choose a different one." };
  }

  // ── Idempotent slug check ─────────────────────────────────────────────────
  const taken = await isSlugTaken(admin, normalizedSlug);
  if (taken) {
    return { ok: false, error: "That slug is already taken. Please choose a different one." };
  }

  // ── Step 1: Create agencies row ───────────────────────────────────────────
  const now = new Date().toISOString();

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({
      slug: normalizedSlug,
      display_name: displayName,
      kind: "agency",
      status: "active",
      template_key: "default",
      supported_locales: ["en"],
      onboarding_completed_at: now,
      plan_tier: "free",
      talent_seat_limit: 5,
    })
    .select("id, slug, display_name")
    .single();

  if (agencyError || !agency?.id) {
    logServerError("talent-workspace-provision.insertAgency", agencyError ?? "no agency row returned");
    return { ok: false, error: "Could not create the workspace. Please try again." };
  }

  // ── Step 2: Create agency_memberships row ─────────────────────────────────
  const { error: membershipError } = await admin
    .from("agency_memberships")
    .insert({
      tenant_id: agency.id,
      profile_id: userId,
      role: "owner",
      status: "active",
      accepted_at: now,
    });

  if (membershipError) {
    logServerError("talent-workspace-provision.insertMembership", membershipError);
    await rollbackAgency(admin, agency.id);
    return { ok: false, error: "Could not attach ownership. Please try again." };
  }

  // ── Step 3: Create agency_domains row (so middleware routes the slug) ──────
  // The slug hostname here is for the path-based app host routing;
  // actual subdomain routing uses the tenant_id match.
  // We insert a domain row with hostname = `${slug}.tulala.digital` so the
  // app host can route /{slug}/admin correctly. This mirrors what the
  // existing workspace onboarding seeds.
  //
  // NOTE: if the agency_domains table schema differs, this is a best-effort
  // insert. If it fails we log and continue — the user can still navigate
  // to /{slug}/admin once the middleware is updated or a manual seed is done.
  const { error: domainError } = await admin
    .from("agency_domains")
    .insert({
      tenant_id: agency.id,
      hostname: `${normalizedSlug}.tulala.digital`,
      status: "active",
      is_primary: true,
    });

  if (domainError) {
    // Non-fatal: log but do not rollback — the workspace + membership are
    // already created. The admin at `/admin` can still be accessed on the
    // app host via the slug path. Document: operator can manually seed
    // agency_domains if subdomain routing is needed.
    logServerError("talent-workspace-provision.insertDomain (non-fatal)", domainError);
  }

  // ── Step 4: Scaffold branding + starter content ───────────────────────────
  // Seed the new workspace from the platform DEFAULT THEME (Modern 2026 unless a
  // super-admin edited the Site Default). `ignoreDuplicates` keeps this a no-op
  // for any existing tenant — only the freshly-created row is themed. Both live
  // + draft layers (tokens AND component styles) are seeded so the builder opens
  // on the modern look with nothing to publish.
  const platformDefault = await loadPlatformDefaultTheme();
  const { error: brandingError } = await admin
    .from("agency_branding")
    .upsert(
      {
        tenant_id: agency.id,
        theme_json: platformDefault.tokens,
        theme_json_draft: platformDefault.tokens,
        component_styles_json: platformDefault.componentStyles,
        component_styles_json_draft: platformDefault.componentStyles,
        theme_preset_slug: platformDefault.presetSlug,
      },
      { onConflict: "tenant_id", ignoreDuplicates: true },
    );
  if (brandingError) {
    logServerError("talent-workspace-provision.upsertBranding (non-fatal)", brandingError);
  }

  const { error: identityError } = await admin
    .from("agency_business_identity")
    .upsert(
      { tenant_id: agency.id, public_name: displayName },
      { onConflict: "tenant_id", ignoreDuplicates: true },
    );
  if (identityError) {
    logServerError("talent-workspace-provision.upsertIdentity (non-fatal)", identityError);
  }

  const starter = await onboardStarterContent(admin, {
    tenantId: agency.id,
    actorProfileId: userId,
    seedFreeStarter: true,
  });
  if (!starter.ok) {
    logServerError(
      "talent-workspace-provision.onboardStarterContent (non-fatal)",
      new Error(starter.error ?? "starter-content failed"),
    );
  }

  return { ok: true, slug: agency.slug };
}
