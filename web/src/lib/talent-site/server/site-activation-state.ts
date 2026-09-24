"use server";

/**
 * Talent site — ACTIVATION STATE (read-only).
 *
 * Answers one question for the Today dashboard: should this talent be told
 * their free website is waiting to be set up?
 *
 * Deliberately separate from `loadMaxSiteManagerAction`, which PROVISIONS the
 * site as a side effect of loading it. That is right on `/talent/site` (the
 * talent asked for the manager), but wrong here: this runs on every Today
 * render, and reusing it would silently mint a `talent_sites` row + site_slug
 * for every talent who merely opened their dashboard. This action only reads.
 *
 * AUTH: owner-gated via `requireTalentSelf()`; the read is the cookie-session
 * client so `talent_sites` RLS applies on top.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { buildTalentSiteCapabilities } from "@/lib/access/talent-membership";
import type { TalentSiteActivationState } from "./site-management-types";

export async function loadTalentSiteActivationStateAction(): Promise<
  TalentSiteActivationState | null
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;

  const capabilities = buildTalentSiteCapabilities(scope.planKey);
  if (!capabilities.personalSiteEdit) {
    return { canManage: false, hasSite: false, isPublished: false };
  }

  const sb = await getCachedServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("talent_sites")
    .select("site_slug, site_published_at")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();
  if (error) {
    logServerError("talentSite.activationState", error);
    return null;
  }

  // A row with a NULL slug is not a usable site: every pre-existing production
  // row looks like that, and none of them serves anything.
  const slug = data?.site_slug ?? null;
  const hasSite = Boolean(slug);
  const isPublished = hasSite && Boolean(data?.site_published_at);

  return { canManage: true, hasSite, isPublished };
}
