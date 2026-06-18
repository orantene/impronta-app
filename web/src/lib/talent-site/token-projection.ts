/**
 * Pure projection of a talent's public-safe starter profile + media into the
 * flat `{{token}}` value map that `hydrateTalentTree` substitutes into the
 * default talent tree / Max-site freeform templates.
 *
 * Split out of `default-talent-tree.ts` (which holds the tree builders) so the
 * shared template-preview hydration + its unit test import the projection on its
 * own, and so neither module grows past the max-lines budget. No server imports
 * — safe on the edge and unit-testable.
 */
import {
  selectServiceFocusLabels,
  type TalentProfileTokens,
} from "./default-talent-tree";
import type {
  TalentPortfolioStarterMedia,
  TalentPortfolioStarterProfile,
} from "./starter";

/**
 * Project a starter profile + media into the flat `{{token}}` value map that
 * `hydrateTalentTree` substitutes. Pure (no server imports) so the shared
 * template-preview hydration + its unit test can call it directly; the
 * server-only `default-talent-template.ts` re-exports it for existing callers.
 */
export function talentProfileTokens(
  profile: TalentPortfolioStarterProfile,
  media: TalentPortfolioStarterMedia[],
  /** Max site URL — non-empty only when the talent has a published Max site. */
  maxSiteUrl = "",
): TalentProfileTokens {
  const displayName = profile.displayName.trim() || "Talent";
  const profilePath = `/t/${profile.profileCode}`;
  const tagline =
    profile.publicBio?.trim().slice(0, 160) ||
    [profile.primaryTypeLabel, profile.homeCity].filter(Boolean).join(" · ") ||
    "";
  // FIX B — the "Services & focus" cards come from the talent's ACTUAL services
  // (services menu), falling back to the discipline (`primaryTypeLabel`). NEVER
  // from `serviceAreaLabels` — those are geographic work markets / cities (shown
  // separately as "Based in {homeCity}"), not services.
  const services = selectServiceFocusLabels(
    profile.serviceNames,
    profile.primaryTypeLabel,
  );
  // FIX 5 — the hero headshot is chosen from a variant set that INCLUDES "card";
  // the gallery set OMITS "card", so on most profiles gallery[0] === headshotUrl
  // and the hero image would repeat as the first masonry tile. Exclude the
  // chosen headshot from the gallery so the hero never duplicates.
  const headshotUrl = profile.headshotUrl ?? "";
  const galleryUrls = media
    .map((m) => m.url)
    .filter((u) => Boolean(u) && u !== headshotUrl);

  // Disciplines — primary first, then non-primary talent types (de-duped). The
  // chip row hydrates `{{primaryTypeLabel}}` + `{{secondaryType1..3}}`; the
  // empty-card prune drops chips whose label resolved to "". `disciplinesLine`
  // is the same set joined " · " for a single-line alternative.
  const primaryTypeLabel = profile.primaryTypeLabel?.trim() ?? "";
  const secondaryTypes = (profile.secondaryTypeLabels ?? [])
    .map((label) => label?.trim())
    .filter((label): label is string => !!label && label !== primaryTypeLabel);
  const disciplinesLine = [primaryTypeLabel, ...secondaryTypes]
    .filter(Boolean)
    .join(" · ");

  // Full bio for the About paragraph. When the talent HAS a real bio we use
  // it verbatim (`richBio` → `publicBio` → short tagline). When NEITHER is
  // set we leave `richBio` empty so the About body paragraph renders blank
  // (an empty <p> is invisible), avoiding a redundant "Discipline · City"
  // line that merely repeats the hero eyebrow and the location line below it.
  // The `locationLine` ("Based in {city}") stays visible regardless.
  const richBio = profile.richBio?.trim() || profile.publicBio?.trim() || "";

  const languagesLine = profile.languagesLabel?.trim()
    ? `Languages: ${profile.languagesLabel.trim()}`
    : "";

  return {
    displayName,
    primaryTypeLabel,
    secondaryType1: secondaryTypes[0] ?? "",
    secondaryType2: secondaryTypes[1] ?? "",
    secondaryType3: secondaryTypes[2] ?? "",
    disciplinesLine,
    tagline,
    bio: profile.publicBio?.trim() || tagline || `Welcome to ${displayName}'s profile.`,
    richBio,
    locationLine: profile.homeCity ? `Based in ${profile.homeCity}` : "",
    languagesLine,
    headshotUrl,
    profilePath,
    inquireHref: `${profilePath}?inquire=1`,
    service1: services[0] ?? "",
    service2: services[1] ?? "",
    service3: services[2] ?? "",
    gallery: galleryUrls.slice(0, 6),
    maxSiteUrl,
  };
}
