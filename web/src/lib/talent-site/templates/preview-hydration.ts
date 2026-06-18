/**
 * TMPL-2 — pure hydration mapping for the shared template-preview route.
 *
 * The preview route renders a template tree with EITHER the requesting talent's
 * own data (owner-gated) OR a public-safe demo persona. Both paths must feed the
 * SAME render inputs so the two template families render identically regardless
 * of which data source supplied them. This module owns the mapping from a data
 * source (real `TalentPortfolioStarterProfile` + media, or the demo fixture) to
 * those render inputs, and the resulting `{{token}}` substitution map.
 *
 * Pure (no server imports) so it is unit-testable and importable on the edge:
 * the route imports the data loaders separately and hands the result here.
 */
import {
  TEMPLATE_PREVIEW_DEMO_FIXTURE,
  type TemplatePreviewDemoFixture,
} from "@/lib/site-admin/builder-core/templates/template-def";
import {
  talentProfileTokens,
  type TalentProfileTokens,
} from "@/lib/talent-site/default-talent-tree";
import type {
  TalentPortfolioStarterMedia,
  TalentPortfolioStarterProfile,
} from "@/lib/talent-site/starter";

/**
 * The render inputs both template families consume. The slot family passes
 * `{ profile, media }` straight to `buildTemplateSnapshot`; the Max-site
 * freeform family passes `tokens` to `hydrateTalentTree`. Building both from one
 * source keeps the two families in lockstep (no per-family demo drift).
 */
export interface TemplatePreviewHydration {
  profile: TalentPortfolioStarterProfile;
  media: TalentPortfolioStarterMedia[];
  tokens: TalentProfileTokens;
  /** True when the data came from a real owner-gated profile (not the demo). */
  isReal: boolean;
}

/**
 * Project the public-safe demo fixture into a `TalentPortfolioStarterProfile`.
 * Used when the request is anonymous / non-owner so the preview still renders a
 * complete, premium-looking page without exposing any real talent's data.
 */
export function demoFixtureToStarterProfile(
  fixture: TemplatePreviewDemoFixture = TEMPLATE_PREVIEW_DEMO_FIXTURE,
): TalentPortfolioStarterProfile {
  return {
    displayName: fixture.displayName,
    profileCode: fixture.profileCode,
    primaryTypeLabel: fixture.primaryTypeLabel,
    publicBio: fixture.publicBio,
    richBio: fixture.publicBio,
    homeCity: fixture.homeCity,
    serviceAreaLabels: [],
    serviceNames: fixture.serviceNames,
    secondaryTypeLabels: [],
    languagesLabel: "",
    headshotUrl: fixture.headshotUrl,
  };
}

/** Demo media derived from the fixture gallery URLs. */
export function demoFixtureToMedia(
  fixture: TemplatePreviewDemoFixture = TEMPLATE_PREVIEW_DEMO_FIXTURE,
): TalentPortfolioStarterMedia[] {
  return fixture.galleryUrls.map((url) => ({ url, alt: fixture.displayName }));
}

/**
 * Build the unified render inputs from a real or demo data source. `isReal`
 * flags whether the caller resolved an owner-gated profile so the route can
 * label the preview ("your data" vs "sample data") and decide caching.
 *
 * `maxSiteUrl` defaults "" — a preview never advertises a live Max-site link
 * (the badge is a publish-time artifact, not a preview concern).
 */
export function buildTemplatePreviewHydration(
  source: {
    profile: TalentPortfolioStarterProfile;
    media: TalentPortfolioStarterMedia[];
  },
  opts: { isReal: boolean },
): TemplatePreviewHydration {
  const tokens = talentProfileTokens(source.profile, source.media, "");
  return {
    profile: source.profile,
    media: source.media,
    tokens,
    isReal: opts.isReal,
  };
}

/**
 * Demo-only convenience: the full hydration inputs for the public-safe persona.
 * Used by the preview route's fallback path and by tests asserting the mapping.
 */
export function demoTemplatePreviewHydration(
  fixture: TemplatePreviewDemoFixture = TEMPLATE_PREVIEW_DEMO_FIXTURE,
): TemplatePreviewHydration {
  return buildTemplatePreviewHydration(
    {
      profile: demoFixtureToStarterProfile(fixture),
      media: demoFixtureToMedia(fixture),
    },
    { isReal: false },
  );
}
