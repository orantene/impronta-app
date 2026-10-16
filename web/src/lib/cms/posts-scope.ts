import "server-only";

/**
 * posts-scope.ts — WHERE a post is written, and WHO may publish it.
 *
 * PM decision 2026-10-14: a talent who OWNS an active business workspace writes
 * posts under that workspace's tenant_id. Only talents without one use
 * `cms_posts.talent_profile_id` (tenant_id NULL). `resolvePostScope` is the ONE
 * place that decides; every Posts action calls it.
 *
 * The GATE stays per actor: a talent checks `talentPosts` (Web Office) even
 * when writing under their workspace scope; a workspace admin checks the
 * workspace posts capability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { canPublishPosts, workspaceCanPublishPosts } from "@/lib/access/posts-capability";
import { logServerError } from "@/lib/server/safe-error";
import type { PostScope } from "@/lib/cms/posts-writer";

export type ResolvePostScopeDeps = {
  loadOwnedBusinessWorkspace: (
    userId: string,
  ) => Promise<{ ownsBusinessWorkspace: boolean; tenantId: string | null }>;
};

/** Talent actor → their workspace tenant if they own one, else their talent profile. */
export async function resolvePostScope(
  input: { userId: string; talentProfileId: string },
  deps: ResolvePostScopeDeps,
): Promise<PostScope> {
  const owned = await deps.loadOwnedBusinessWorkspace(input.userId);
  if (owned.ownsBusinessWorkspace && owned.tenantId) {
    return { kind: "tenant", tenantId: owned.tenantId };
  }
  return { kind: "talent", talentProfileId: input.talentProfileId };
}

/** Workspace plan (agencies.plan_tier) → posts capability. Fails closed on a read error. */
export async function loadWorkspaceCanPublishPosts(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await admin.from("agencies").select("plan_tier").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("cms/posts-scope/workspace-plan", error);
    return false;
  }
  return workspaceCanPublishPosts((data as { plan_tier: string | null } | null)?.plan_tier);
}

/** Talent plan (talent_profiles.talent_plan_key) → talentPosts. Fails closed on a read error. */
export async function loadTalentCanPublishPosts(
  admin: Pick<SupabaseClient, "from">,
  talentProfileId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("talent_profiles")
    .select("talent_plan_key")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("cms/posts-scope/talent-plan", error);
    return false;
  }
  return canPublishPosts((data as { talent_plan_key: string | null } | null)?.talent_plan_key);
}
