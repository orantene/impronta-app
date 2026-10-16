/**
 * Posts v1 (TUL-1007) — the two capability readers the Posts write path and
 * the scheduled-publish cron use. Pure + client-safe (the writer UI may show
 * the lock from the same answer; the SERVER is the gate).
 *
 * No plan-string compares here: the plan list lives in plan-catalog
 * (`POSTS_PUBLISH_PLAN_KEYS`), the talent half is read through the site-scoped
 * reader (`talentPlanGrantsSiteCapability(_, "talentPosts")`).
 */
import { planGrantsPosts } from "./plan-catalog";
import { talentPlanGrantsSiteCapability } from "./talent-membership";

/** Talent actor: Web Office (talent_portfolio or talent_pro). */
export function canPublishPosts(talentPlanKey: string | null | undefined): boolean {
  return talentPlanGrantsSiteCapability(talentPlanKey, "talentPosts");
}

/** Workspace admin actor: `agencies.plan_tier` is `website` or above. */
export function workspaceCanPublishPosts(planTier: string | null | undefined): boolean {
  return planGrantsPosts(planTier);
}
