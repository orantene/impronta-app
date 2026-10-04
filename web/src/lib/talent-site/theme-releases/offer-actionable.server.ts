import "server-only";

/**
 * THEME RELEASES (F117/F118): is an update offer worth showing at all?
 *
 * An offer is ACTIONABLE when applying would do something (her site has an
 * exact base AND the offer has non-block items) or when at least one new block
 * is still missing from her page (not recorded as added, not present by origin
 * key). A noBase site whose every new block is already on her page has nothing
 * to tell her: no banner, no quiet entry, no bell.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { findKeyPath } from "./tree-ops";
import { pendingCriticalItems } from "./critical-targeted";
import type { ReleaseItem } from "./types";
import { applyItemsOf, combineReleaseItems } from "./talent-update/view";

/**
 * F117: a new block she already added (recorded on any covered row) or that is
 * already on her page by origin key is never offered again.
 */
export function withoutPresentBlocks(
  items: ReadonlyArray<ReleaseItem>,
  addedIds: ReadonlyArray<string>,
  homeBlocks: BuilderNode[],
): ReleaseItem[] {
  const added = new Set(addedIds);
  return items.filter((i) => {
    if (i.type !== "new-block") return true;
    if (added.has(i.id ?? `${i.type}:${i.key}`)) return false;
    return !findKeyPath(homeBlocks, i.key.replace(/^(shell|home):/, ""));
  });
}

/** F125: critical items that may still apply to a noBase site (ids are remembered in `addedIds`). */
export const hasCriticalCandidates = (items: ReadonlyArray<ReleaseItem>, addedIds: ReadonlyArray<string>) =>
  pendingCriticalItems(items, addedIds).length > 0;

/** PURE: does this offer give her anything to do? `criticalPossible` = an unapplied critical item exists. */
export function isOfferActionable(input: {
  hasBase: boolean;
  items: ReadonlyArray<ReleaseItem>;
  addedIds: ReadonlyArray<string>;
  homeBlocks: BuilderNode[];
  criticalPossible?: boolean;
}): boolean {
  if (input.hasBase && applyItemsOf(input.items).length > 0) return true;
  if (input.criticalPossible) return true;
  return withoutPresentBlocks(input.items, input.addedIds, input.homeBlocks).some((i) => i.type === "new-block");
}

/** The items a noBase sheet lists: missing new blocks, plus the critical items that would change her site. */
export function noBaseOfferItems(
  items: ReadonlyArray<ReleaseItem>,
  addedIds: ReadonlyArray<string>,
  homeBlocks: BuilderNode[],
  fixItemIds: ReadonlyArray<string>,
): ReleaseItem[] {
  const fix = new Set(fixItemIds);
  return withoutPresentBlocks(items, addedIds, homeBlocks).filter(
    (i) => i.type === "new-block" || (i.type === "critical" && fix.has(i.id ?? `${i.type}:${i.key}`)),
  );
}

/**
 * Does her pinned version have an exact merge base? Mirrors the base resolver:
 * its `talent_theme_versions` snapshot, or the release's saved base payload
 * when she sits on that release's own from-version. `null` = a read failed
 * (caller must not treat that as "no base").
 */
export async function pinnedBaseKnown(
  admin: SupabaseClient,
  input: { designSlug: string; pinned: number | null; releaseId: string; baseFromVersion: number },
): Promise<boolean | null> {
  if (input.pinned === null) return false;
  const snap = await admin
    .from("talent_theme_versions")
    .select("version")
    .eq("design", input.designSlug)
    .eq("version", input.pinned)
    .maybeSingle();
  if (snap.error) {
    logServerError("themeUpdate.offer.snapshot", snap.error);
    return null;
  }
  if (snap.data) return true;
  if (input.pinned !== input.baseFromVersion) return false;
  const rel = await admin
    .from("talent_theme_releases")
    .select("base_payload")
    .eq("id", input.releaseId)
    .maybeSingle();
  if (rel.error) {
    logServerError("themeUpdate.offer.basePayload", rel.error);
    return null;
  }
  const bp = (rel.data as { base_payload?: unknown } | null)?.base_payload;
  return !!bp && typeof bp === "object";
}

/** Full items + tree + base check for one design's open rows. `null` when a read failed. */
export async function offerActionableFor(
  admin: SupabaseClient,
  talentProfileId: string,
  slug: string,
  pinned: number | null,
  rows: ReadonlyArray<{ id: string; release_id: string; report?: { addedBlocks?: unknown } | null }>,
  newest: { id: string; from_version: number },
  /** F125: noBase + a critical item pending: would the targeted fix change her site? */
  criticalWouldChange?: () => Promise<boolean>,
): Promise<boolean | null> {
  const { data, error } = await admin
    .from("talent_theme_releases")
    .select("id, to_version, items")
    .in("id", rows.map((r) => r.release_id));
  if (error || !Array.isArray(data)) return null;
  const items = combineReleaseItems(
    [...(data as Array<{ to_version: number; items?: ReleaseItem[] | null }>)].sort((a, b) => a.to_version - b.to_version),
  );
  const [known, treeRes] = await Promise.all([
    pinnedBaseKnown(admin, { designSlug: slug, pinned, releaseId: newest.id, baseFromVersion: newest.from_version }),
    admin.from("talent_pages").select("blocks").eq("talent_profile_id", talentProfileId).eq("is_home", true).maybeSingle(),
  ]);
  if (known === null || treeRes.error) return null;
  const blocks = (treeRes.data as { blocks?: unknown } | null)?.blocks;
  const tree = Array.isArray(blocks) ? (blocks as BuilderNode[]) : [];
  const addedIds = rows.flatMap((r) =>
    Array.isArray(r.report?.addedBlocks) ? (r.report!.addedBlocks as unknown[]).filter((x): x is string => typeof x === "string") : [],
  );
  const base = { hasBase: known, items, addedIds, homeBlocks: tree };
  if (isOfferActionable(base)) return true;
  // F125: a critical fix still reaches a noBase site; only a real change keeps the notice.
  if (!known && criticalWouldChange && hasCriticalCandidates(items, addedIds)) return criticalWouldChange();
  return false;
}

