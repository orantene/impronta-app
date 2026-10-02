import type { Plan, Surface } from "../state/types";

const RANK: Record<Plan, number> = { free: 0, website: 1, studio: 2, agency: 3, network: 4 };

/**
 * A plan-upgrade welcome fires only on a real rank increase, and never for a
 * solo talent (talent surface): Studio, Agency and Network welcomes describe
 * team, multi-brand and roster features a solo talent does not have. Network
 * is additionally only ever shown for the Network plan itself.
 */
export function shouldCelebratePlan(prev: Plan | null, next: Plan, surface: Surface): boolean {
  if (!prev || prev === next) return false;
  if (RANK[next] <= RANK[prev]) return false;
  if (surface === "talent" && RANK[next] >= RANK.studio) return false;
  return true;
}
