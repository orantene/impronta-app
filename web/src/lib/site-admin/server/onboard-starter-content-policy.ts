import { resolvePublicRosterDisplayCap } from "@/lib/saas/roster-seat-limit";

export const FREE_STARTER_PROFILE_CAP = 5;

export function resolveFreeStarterRosterSeedCount(input: {
  planTier: string | null;
  seatLimit: number | null;
  totalRosterCount: number;
  publicVisibleCount: number;
}): number {
  if (input.planTier !== "free") return 0;
  if (input.publicVisibleCount > 0) return 0;
  if (input.totalRosterCount > 0) return 0;
  const cap = resolvePublicRosterDisplayCap(input.planTier, input.seatLimit);
  const effectiveCap =
    cap == null
      ? FREE_STARTER_PROFILE_CAP
      : Math.max(0, Math.trunc(cap));
  return Math.max(
    0,
    Math.min(FREE_STARTER_PROFILE_CAP, effectiveCap),
  );
}
