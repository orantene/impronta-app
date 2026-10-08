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
import { activationFromRow, type ActivationRow } from "./site-activation-core";

export async function loadTalentSiteActivationStateAction(): Promise<
  TalentSiteActivationState | null
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;

  const capabilities = buildTalentSiteCapabilities(scope.planKey);
  // Read the row even when capabilities.personalSiteEdit is off (flag-off
  // builds make it Max-only): a design applied through the free Design
  // presets must still read as applied (F53). activationFromRow decides.

  const sb = await getCachedServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("talent_sites")
    .select("site_slug, site_published_at, theme_design_slug, theme_look_slug")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();
  if (error) {
    logServerError("talentSite.activationState", error);
    return null;
  }

  return activationFromRow(data as ActivationRow, capabilities);
}
