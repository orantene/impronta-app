import "server-only";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { planPermitsPublishedTalentSite } from "@/lib/talent-site/plan-permits-snapshot";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import {
  loadTalentPublicSiteByProfileCode,
  loadTalentPublicSiteDraftForOwner,
} from "@/lib/talent-site/server/public-load";

/**
 * Current effective plan for a talent (the materialized `talent_plan_key`,
 * kept current by the expiry reconcile + daily cron). Read-only; service-role
 * because the public client can't see another talent's plan. Returns null on
 * any failure so the gate fails OPEN — a transient DB hiccup never downgrades
 * a paying talent's site.
 */
async function loadCurrentTalentPlanKey(
  talentProfileId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("talent_profiles")
    .select("talent_plan_key")
    .eq("id", talentProfileId)
    .maybeSingle();
  return (
    (data as { talent_plan_key?: string | null } | null)?.talent_plan_key ?? null
  );
}

export type PlatformTalentSiteResolveResult =
  | { kind: "render"; snapshot: TalentSiteSnapshot; draftPreview: boolean }
  | { kind: "fallback" }
  | { kind: "not_found" };

/**
 * On Tulala platform hosts, resolve whether `/t/<code>` should render the Max
 * snapshot or fall back to the default profile template.
 */
export async function resolvePlatformTalentSiteForProfile(
  profileCode: string,
  opts: { previewDraft?: boolean },
): Promise<PlatformTalentSiteResolveResult> {
  const loaded = await loadTalentPublicSiteByProfileCode(profileCode);

  if (loaded.kind === "not_found") {
    return { kind: "not_found" };
  }

  if (opts.previewDraft) {
    const session = await getCachedActorSession();
    if (session.user) {
      const draft = await loadTalentPublicSiteDraftForOwner(
        profileCode,
        session.user.id,
      );
      if (draft) {
        return { kind: "render", snapshot: draft, draftPreview: true };
      }
    }
  }

  if (loaded.kind === "published") {
    // Read-time plan gate — data-preserving graceful degradation. If the
    // talent's current plan no longer permits this published composition
    // (e.g. a Max trial lapsed back to Pro/Free), fall back to the default
    // profile instead of serving the premium page. The snapshot row is never
    // mutated, so the full site returns the instant the plan is restored.
    const planKey = await loadCurrentTalentPlanKey(loaded.row.talent_profile_id);
    if (planKey && !planPermitsPublishedTalentSite(loaded.snapshot, planKey)) {
      return { kind: "fallback" };
    }
    return {
      kind: "render",
      snapshot: loaded.snapshot,
      draftPreview: false,
    };
  }

  return { kind: "fallback" };
}
