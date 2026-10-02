/**
 * THEME RELEASES (Phase 3): fan-out effects behind injected ports (pure
 * orchestration; the DB adapter lives in `release-manager.server.ts`). Skips
 * sites that already have an update row for the release and talents that
 * already have this release's bell entry, so re-running is safe.
 */
import type { ThemeRelease } from "../types";
import { planFanOut, type BellRow, type FanOutSite, type UpdateRow } from "./notify";

export interface FanOutPorts {
  existingUpdateSiteIds: (releaseId: string) => Promise<Set<string>>;
  existingBellUserIds: (releaseId: string) => Promise<Set<string>>;
  insertUpdates: (rows: UpdateRow[]) => Promise<void>;
  insertBells: (rows: BellRow[]) => Promise<void>;
}

export async function fanOutWithPorts(
  ports: FanOutPorts,
  release: Pick<ThemeRelease, "id" | "design_slug" | "to_version" | "rollout_pct">,
  sites: ReadonlyArray<FanOutSite & { pinnedVersion: number | null }>,
): Promise<{ updates: number; bells: number }> {
  // A site already on (or past) the target has nothing to update.
  const eligible = sites.filter((s) => (s.pinnedVersion ?? 0) < release.to_version);
  const plan = planFanOut(release, eligible);
  const [haveUpdate, haveBell] = await Promise.all([
    ports.existingUpdateSiteIds(release.id),
    ports.existingBellUserIds(release.id),
  ]);
  const updates = plan.updates.filter((u) => !haveUpdate.has(u.talent_site_id));
  const bells = plan.bells.filter((b) => !haveBell.has(b.user_id));
  if (updates.length > 0) await ports.insertUpdates(updates);
  if (bells.length > 0) await ports.insertBells(bells);
  return { updates: updates.length, bells: bells.length };
}
