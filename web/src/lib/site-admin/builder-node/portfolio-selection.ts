/**
 * Selection helpers for the live-bound `portfolio` widget (W-12).
 * Mirrors `services-catalog-selection.ts` for media shots.
 */
import type { TalentPortfolioShot } from "./portfolio-types";

export type PortfolioSelectionInput = {
  selectionMode?: "all" | "ids";
  selectedMediaIds?: string[];
  autoIncludeNew?: boolean;
  limit?: number;
  albumId?: string;
  shotBindings?: ReadonlyArray<{
    mediaId: string;
    offeringId?: string;
    caption?: string;
  }>;
};

/** Apply editor selection + optional per-shot caption / offering overrides. */
export function filterShotsForPortfolio(
  shots: ReadonlyArray<TalentPortfolioShot>,
  opts: PortfolioSelectionInput,
): TalentPortfolioShot[] {
  const bindings = new Map(
    (opts.shotBindings ?? []).map((b) => [b.mediaId, b] as const),
  );

  let list = shots.map((shot) => {
    const bind = bindings.get(shot.id);
    if (!bind) return shot;
    return {
      ...shot,
      offeringId: bind.offeringId ?? shot.offeringId,
      offeringTitle: bind.offeringId ? shot.offeringTitle : shot.offeringTitle,
      caption: bind.caption ?? shot.caption,
    };
  });

  const albumId = opts.albumId?.trim();
  if (albumId) {
    list = list.filter((s) => (s.albumId ?? "").trim() === albumId);
  }

  if (opts.selectionMode === "ids") {
    const ids = new Set(opts.selectedMediaIds ?? []);
    if (ids.size > 0) {
      list = list.filter((s) => ids.has(s.id));
      // Preserve manual order when selectedMediaIds is set.
      const order = opts.selectedMediaIds ?? [];
      list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    } else if (opts.autoIncludeNew !== true) {
      list = [];
    }
  }

  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 24);
  return list.slice(0, limit);
}
