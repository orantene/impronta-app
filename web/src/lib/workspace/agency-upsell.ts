import type { Plan } from "@/components/admin/shell/internal/state/types";

/**
 * TUL-734 item 2 (PM ruling): a solo talent workspace must not see the
 * Agency / Studio upsell on Clients (the studio locked card, "Per-client
 * history", "Custom fields", "Reports"). It matches TUL-380: a solo talent
 * does not see agency concepts.
 *
 * "Solo talent" is: a roster of exactly one, on a talent workspace (not a
 * business one), with no studio or agency posture. `surface === "talent"`
 * alone is not enough: a solo owner on the talent surface can still run an
 * agency. A studio, agency or network plan IS an agency or studio posture.
 */
const SOLO_PLANS: ReadonlySet<Plan> = new Set<Plan>(["free", "website"]);

export function isSoloTalentWorkspace(input: {
  rosterCount: number;
  workspaceType: "talent" | "business";
  plan: Plan;
}): boolean {
  return input.rosterCount === 1 && input.workspaceType === "talent" && SOLO_PLANS.has(input.plan);
}

const RANK: Record<Plan, number> = { free: 0, website: 1, studio: 2, agency: 3, network: 4 };

/**
 * Whether Clients draws the locked Agency / Studio upsell cards: never for a
 * solo talent; for agency or business workspaces only while the plan is below
 * the agency tier (a workspace that already has the capability sees the real
 * cards, with no lock).
 */
export function showAgencyUpsell(input: { plan: Plan; soloTalent: boolean }): boolean {
  if (input.soloTalent) return false;
  return RANK[input.plan] < RANK.agency;
}
