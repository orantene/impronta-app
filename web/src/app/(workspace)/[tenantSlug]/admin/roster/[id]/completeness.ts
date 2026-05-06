// Phase 3.12 / Roster — profile completeness scoring.
//
// Server-safe: pure data, no JSX, no React. Both the server page (which
// pre-computes the snapshot before passing to <CompletenessCard />) and
// the client CompletenessDial component import from here.
//
// Split out of CompletenessDial.tsx because that file is `"use client"` —
// Next.js forbids server components from calling functions exported by a
// client module.

import type {
  TalentTaxonomyAssignment,
  TalentLanguageRow,
  TalentServiceAreaRow,
  PortfolioMediaRow,
} from "./talent-data";

export type CompletenessSnapshot = {
  hasName: boolean;
  hasShortBio: boolean;
  hasLongBio: boolean;
  hasPhoto: boolean;
  hasPrimaryRole: boolean;
  hasSecondaryDepth: boolean;
  hasLanguage: boolean;
  hasHomeCity: boolean;
  hasServiceArea: boolean;
  hasPortfolio: boolean;
};

export function computeCompleteness(args: {
  initial: {
    display_name?: string;
    short_bio?: string | null;
    home_city_text?: string | null;
    photo_url?: string | null;
  };
  taxonomy: TalentTaxonomyAssignment[];
  languages: TalentLanguageRow[];
  areas: TalentServiceAreaRow[];
  portfolio: PortfolioMediaRow[];
}): CompletenessSnapshot {
  const { initial, taxonomy, languages, areas, portfolio } = args;
  const galleryCount = portfolio.filter(
    (p) => p.variantKind === "portfolio" || p.variantKind === "gallery",
  ).length;
  return {
    hasName:           Boolean(initial.display_name?.trim()),
    hasShortBio:       Boolean(initial.short_bio?.trim()),
    hasLongBio:        false,
    hasPhoto:          Boolean(initial.photo_url),
    hasPrimaryRole:    taxonomy.some((t) => t.relationshipType === "primary_role"),
    hasSecondaryDepth: taxonomy.some(
      (t) =>
        t.relationshipType === "secondary_role" ||
        t.relationshipType === "skill" ||
        t.relationshipType === "context" ||
        t.relationshipType === "attribute",
    ),
    hasLanguage:       languages.length > 0,
    hasHomeCity:       Boolean(initial.home_city_text?.trim()) ||
                       areas.some((a) => a.serviceKind === "home_base"),
    hasServiceArea:    areas.length > 0,
    hasPortfolio:      galleryCount > 0,
  };
}
