/**
 * One score for the free website. Weights are fixed:
 * who 20, photos 30, something to book 28, intro 10, when 6, where 6.
 * A slice that is not known yet is null. The headline percent is null
 * until every slice is known, so a missing fact never becomes 0.
 */

export type WebsiteSliceKey = "who" | "photos" | "offer" | "intro" | "when" | "where";

export type WebsiteEligibilityInput = {
  hasNameAndWork: boolean | null;
  photoCount: number | null;
  bookableCount: number | null;
  hasIntro: boolean | null;
  hasAvailability: boolean | null;
  hasPlace: boolean | null;
};

export type WebsiteSlice = {
  key: WebsiteSliceKey;
  weight: number;
  /** null when the fact is not loaded. */
  done: boolean | null;
  earned: number;
};

const WEIGHTS: Record<WebsiteSliceKey, number> = {
  who: 20,
  photos: 30,
  offer: 28,
  intro: 10,
  when: 6,
  where: 6,
};

function slice(key: WebsiteSliceKey, done: boolean | null): WebsiteSlice {
  return {
    key,
    weight: WEIGHTS[key],
    done,
    earned: done ? WEIGHTS[key] : 0,
  };
}

export function getWebsiteEligibility(input: WebsiteEligibilityInput): {
  percent: number | null;
  slices: WebsiteSlice[];
  unlocked: boolean;
} {
  const slices: WebsiteSlice[] = [
    slice("who", input.hasNameAndWork),
    slice("photos", input.photoCount == null ? null : input.photoCount >= 3),
    slice("offer", input.bookableCount == null ? null : input.bookableCount >= 1),
    slice("intro", input.hasIntro),
    slice("when", input.hasAvailability),
    slice("where", input.hasPlace),
  ];
  const known = slices.every((s) => s.done != null);
  const percent = known ? slices.reduce((n, s) => n + s.earned, 0) : null;
  return { percent, slices, unlocked: percent === 100 };
}
