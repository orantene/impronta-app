/**
 * W-12 contact-sheet tag filter (Frame, TH08): pure helpers. A shot's tag comes
 * from `media_assets.metadata.tag` or an editor `shotBindings[].tag` override.
 * Case-insensitive, first-seen label wins; blank tags are ignored.
 */
import type { TalentPortfolioShot } from "./portfolio-types";

export type PortfolioTag = { label: string; count: number };

const norm = (t: string | null | undefined) => (t ?? "").trim().toLowerCase();

export function portfolioTagList(shots: ReadonlyArray<Pick<TalentPortfolioShot, "tag">>): PortfolioTag[] {
  const out = new Map<string, PortfolioTag>();
  for (const s of shots) {
    const key = norm(s.tag);
    if (!key) continue;
    const hit = out.get(key);
    if (hit) hit.count += 1;
    else out.set(key, { label: (s.tag ?? "").trim(), count: 1 });
  }
  return [...out.values()];
}

/** `active` null = "all". */
export function shotMatchesTag(shot: Pick<TalentPortfolioShot, "tag">, active: string | null): boolean {
  if (active === null) return true;
  return norm(shot.tag) === norm(active);
}
