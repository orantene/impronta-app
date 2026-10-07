// TUL-231 — wires the deleted-account prefix release into the reaper pass.
// Flag off (default) = DRY RUN: the returned plan is the NORMAL plan; the
// report only says what enforcing would release.

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_GRACE_DAYS,
  classifyStorageObjects,
  type ClassifyInput,
  type ObjectVerdict,
  type ReapPlan,
} from "@/lib/media/reap-orphaned-media";
import { isPrefixReleasedForDeletedTalent } from "@/lib/media/deleted-account-prefixes";
import { loadEligibleDeletedTalentIds } from "@/lib/media/deleted-account-prefixes-io";

export type DeletedAccountPrefixReport = {
  enforce: boolean;
  /** false = the id lookup failed; nothing was released. */
  ok: boolean;
  error?: string;
  eligibleDeletedTalents: number;
  /** Objects the release makes deletable that the normal plan keeps (pre-cap). */
  releasedCount: number;
  releasedBytes: number;
  /** Objects under a released prefix still kept because they have no media_assets row. */
  stillUnaccountedCount: number;
  /** true = the release shaped the returned plan. */
  applied: boolean;
};

const EMPTY: DeletedAccountPrefixReport = {
  enforce: false,
  ok: true,
  eligibleDeletedTalents: 0,
  releasedCount: 0,
  releasedBytes: 0,
  stillUnaccountedCount: 0,
  applied: false,
};

function eligibleOf(plan: ReapPlan): ObjectVerdict[] {
  return [...plan.deletable, ...plan.kept.filter((k) => k.keepReason === "over_deletion_cap")];
}

export async function planWithDeletedAccountPrefixes(args: {
  admin: SupabaseClient;
  input: ClassifyInput;
  enforce: boolean;
}): Promise<{ plan: ReapPlan; report: DeletedAccountPrefixReport }> {
  const { admin, input, enforce } = args;
  const normal = classifyStorageObjects(input);
  const lookup = await loadEligibleDeletedTalentIds(admin, input.now, input.graceDays ?? DEFAULT_GRACE_DAYS);
  if (!lookup.ok) {
    logServerError("media-reaper.deleted-account-prefix", lookup.error);
    return { plan: normal, report: { ...EMPTY, enforce, ok: false, error: lookup.error } };
  }
  if (lookup.ids.size === 0) return { plan: normal, report: { ...EMPTY, enforce } };

  const released = (bucketId: string, path: string) =>
    isPrefixReleasedForDeletedTalent(lookup.ids, bucketId, path);
  const withRelease = classifyStorageObjects({ ...input, releasedProtectedPrefix: released });

  const before = new Set(eligibleOf(normal).map((v) => `${v.bucketId} ${v.storagePath}`));
  const added = eligibleOf(withRelease).filter((v) => !before.has(`${v.bucketId} ${v.storagePath}`));
  const stillUnaccounted = withRelease.kept.filter(
    (k) =>
      (k.keepReason === "unaccounted_no_asset_row" || k.keepReason === "unaccounted_within_grace") &&
      released(k.bucketId, k.storagePath),
  );

  return {
    plan: enforce ? withRelease : normal,
    report: {
      enforce,
      ok: true,
      eligibleDeletedTalents: lookup.ids.size,
      releasedCount: added.length,
      releasedBytes: added.reduce((n, v) => n + v.sizeBytes, 0),
      stillUnaccountedCount: stillUnaccounted.length,
      applied: enforce,
    },
  };
}
