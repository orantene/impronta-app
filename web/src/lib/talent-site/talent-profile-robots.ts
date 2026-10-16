import type { Metadata } from "next";

/**
 * Robots policy for the platform /t/<code> profile page. Mirrors the predicates
 * the platform sitemap uses (app/sitemap.ts): a profile that is not publicly
 * listed, is hidden, or whose visibility is not "public" may still render (owners
 * share the link) but must never be indexed.
 *
 * Missing flags (null/undefined) are treated as the sitemap treats them: a row
 * only counts as listed when `isPubliclyListed === true` and `visibility ===
 * "public"`, and as hidden only when `isPubliclyHidden === true`.
 */
export function talentProfileRobots(input: {
  isPubliclyListed: boolean | null | undefined;
  isPubliclyHidden: boolean | null | undefined;
  visibility: string | null | undefined;
  draftPreview?: boolean;
}): Metadata["robots"] | undefined {
  const indexable =
    !input.draftPreview &&
    input.isPubliclyListed === true &&
    input.isPubliclyHidden !== true &&
    input.visibility === "public";
  return indexable ? undefined : { index: false, follow: false };
}

/** Spreadable metadata fragment for a profile row (see `talentProfileRobots`). */
export function talentProfileRobotsMeta(profile: {
  is_publicly_listed?: boolean | null;
  is_publicly_hidden?: boolean | null;
  visibility?: string | null;
}): Pick<Metadata, "robots"> {
  const robots = talentProfileRobots({
    isPubliclyListed: profile.is_publicly_listed,
    isPubliclyHidden: profile.is_publicly_hidden,
    visibility: profile.visibility,
  });
  return robots ? { robots } : {};
}
