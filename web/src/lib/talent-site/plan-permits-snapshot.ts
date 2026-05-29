import { talentPlanToTier } from "@/lib/access/talent-membership";
import { isTemplateAllowedForTier } from "@/lib/talent-site/templates/registry";
import type { TalentSiteTemplateKey } from "@/lib/talent-site/templates/types";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";

/**
 * Read-time plan gate for a PUBLISHED talent-site snapshot.
 *
 * Answers: may `planKey` serve this published composition AS-IS on the public
 * page right now? Custom composition is a Max-only capability; premium
 * templates are unlocked by tier. When a trial / comp grant lapses and the
 * talent reverts to a lower plan, this returns `false` so the public render
 * falls back to the default profile instead of serving the premium page.
 *
 * This is the public-page half of data-preserving graceful degradation: the
 * stored snapshot row is NEVER mutated, so the full site returns the instant
 * the plan is restored. It complements `clampSnapshotForPublish` (publish-time)
 * — you can't publish above your plan, and a post-publish downgrade stops the
 * premium page from being served. Pure (no server-only imports) so it can be
 * unit-tested and shared.
 *
 * Note: the renderer (`TalentSiteRenderer`) renders `snapshot.slots` regardless
 * of `compositionMode`, so degradation MUST be a render-path gate (fall back),
 * not a `compositionMode` flip — flipping the flag alone would not change what
 * a visitor sees.
 */
export function planPermitsPublishedTalentSite(
  snapshot: Pick<TalentSiteSnapshot, "compositionMode" | "templateKey">,
  planKey: string | null | undefined,
): boolean {
  const tier = talentPlanToTier(planKey);

  // The custom builder is a Max-only capability.
  if (snapshot.compositionMode === "custom" && tier !== "max") {
    return false;
  }

  // A template-mode site must use a template unlocked at the current tier
  // (e.g. a premium Pro/Max template under a lapsed Free plan).
  if (
    snapshot.templateKey &&
    !isTemplateAllowedForTier(snapshot.templateKey as TalentSiteTemplateKey, tier)
  ) {
    return false;
  }

  return true;
}
