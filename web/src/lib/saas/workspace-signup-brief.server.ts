/**
 * Brief-backed helpers for workspace provisioning.
 *
 * THE BRIEF IS READ BEFORE THE WORKSPACE IS CREATED, not after.
 *
 * Its industry has to be in hand when `buildSignupSettings` runs, because
 * `industry_preset` is written INTO the agency row at insert and every seeded
 * page and nav label is derived from it once, at scaffold time, and never
 * re-derived. Loading the brief after the insert — which is where the link
 * used to be — meant the facts arrived a step too late to decide anything.
 *
 * Verified against El Paisa's real brief rows:
 *
 *   business.name        "Parrilla El Paisa"      ai_inference 0.45
 *   work.industry        "food and restaurant"    ai_inference 0.40
 *   presence.website_url the menu URL             url_import   0.90
 *
 * There is NO `business.description` fact — the intake stores what someone
 * does under `work.industry`, and `pickSignupPreset` only ever read the
 * description. Measured with those exact values:
 *
 *   businessDescription ""                     -> custom
 *   businessDescription "food and restaurant"  -> restaurant
 *
 * So the industry was sitting in the brief, correctly extracted, one field
 * away from the only reader that wanted it.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { Brief } from "@/lib/tulala/brief-store";
import {
  linkBriefObjects,
  loadBriefForSignupLead,
} from "@/lib/tulala/brief-store.server";

export { loadBriefForSignupLead };

/**
 * `BriefFact.value` is `unknown` — a fact's value is whatever its key's type
 * says, and this one is only useful if it really is a string. Anything else is
 * treated as absent rather than stringified: `[object Object]` reaching a
 * keyword matcher would resolve to `custom` anyway, but silently.
 */
export function industryFromBrief(brief: Brief | null | undefined): string | null {
  const industryFact = brief?.facts.find((f) => f.factKey === "work.industry")?.value;
  return typeof industryFact === "string" ? industryFact : null;
}

/**
 * The lead's description first: it is what the person typed about themselves.
 * The brief's industry is the fallback, not the override — a model's
 * 0.40-confidence inference must not outrank a human sentence.
 */
export function resolveSignupBusinessDescription(
  leadBusinessDescription: string | null | undefined,
  briefIndustry: string | null | undefined,
): string | null {
  return leadBusinessDescription?.trim() || briefIndustry?.trim() || null;
}

/**
 * THE BRIEF GETS AN OWNER, AND IT HAPPENS BEFORE THE SCAFFOLD RUNS.
 *
 * Stamping `tenant_id` is what makes facts findable FROM the workspace
 * afterwards, which is what "Regenerate from brief" needs on its second run.
 *
 * ORDER IS LOAD-BEARING: `ensureWorkspaceScaffold` seeds navigation and
 * homepage copy ONCE from settings and never re-derives them. Non-fatal on
 * failure: a workspace that exists without its brief linked is recoverable, a
 * signup that dies at the last step is not.
 */
export async function linkBriefToProvisionedTenant(
  brief: Brief,
  tenantId: string,
): Promise<void> {
  const linked = await linkBriefObjects(brief.id, { tenantId });
  if (!linked.ok) {
    logServerError(
      "workspace-signup.linkBrief",
      new Error(`brief ${brief.id} not linked to tenant ${tenantId}`),
    );
  }
}
