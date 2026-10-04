/**
 * Optimistic concurrency on `talent_sites.draft_rev`, client + server helpers.
 * Isomorphic and pure (module state only for the same-tab adoption chain).
 *
 * The talent builder's CAS `pageVersion` IS the site's draft_rev: load returns
 * it, every draft write sends it as `expected_draft_rev`, and the server bumps
 * it atomically. A mismatch means another tab wrote first: the write lands
 * nothing and the editor shows "Updated in another tab · Reload".
 *
 * Same-tab writes that do not ride the builder's save lane (the Theme drawer's
 * colour save) bump the rev too. They record `from → to` here, and the builder
 * adapters translate a stale expected rev through that chain, so the talent's
 * own colour change never reads as a conflict with herself.
 */

/** Epoch-seconds versions (the old updated_at CAS) are never a draft_rev. */
const LEGACY_EPOCH_FLOOR = 1_000_000_000;

const adopted = new Map<number, number>();

export function adoptDraftRev(from: number | null | undefined, to: number | null | undefined): void {
  if (typeof from !== "number" || typeof to !== "number" || from === to) return;
  adopted.set(from, to);
  // Keep the chain short: nothing older than a handful of hops matters.
  if (adopted.size > 64) {
    const first = adopted.keys().next().value;
    if (typeof first === "number") adopted.delete(first);
  }
}

/** Follow same-tab adoptions from the editor's version to the latest known rev. */
export function resolveExpectedDraftRev(version: number | null | undefined): number | null {
  if (typeof version !== "number" || !Number.isFinite(version)) return null;
  let v = version;
  for (let hops = 0; hops < 64; hops += 1) {
    const next = adopted.get(v);
    if (typeof next !== "number") break;
    v = next;
  }
  return v;
}

export function resetDraftRevAdoptions(): void {
  adopted.clear();
}

export function isLegacyEpochVersion(v: number | null | undefined): boolean {
  return typeof v === "number" && v >= LEGACY_EPOCH_FLOOR;
}

/** The CAS version a surface reports after a write: draft_rev, else the old epoch. */
export function versionAfterWrite(result: { draftRev?: number | null; updatedAt: string }): number {
  if (typeof result.draftRev === "number") return result.draftRev;
  return Math.floor(new Date(result.updatedAt).getTime() / 1000);
}

/** The code every builder surface already treats as a cross-tab conflict. */
export const DRAFT_REV_CONFLICT_CODE = "VERSION_CONFLICT" as const;
