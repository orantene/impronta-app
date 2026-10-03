/**
 * Maison seed → theme-preview hydration (Track G Wave 1 / G1-P0-03).
 * Projects the nails starter pack into the same TemplatePreviewHydration +
 * freeform dataSources shape demo-talent previews use, without inventing a
 * profile code or touching the signed-in talent.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { BuilderNodeRenderDataSources } from "@/lib/site-admin/builder-node/render";
import {
  buildTemplatePreviewHydration,
  type TemplatePreviewHydration,
} from "@/lib/talent-site/templates/preview-hydration";
import type { TalentPortfolioStarterProfile } from "@/lib/talent-site/starter";
import { loadMaisonStarterCatalog } from "./maison-starter-catalog";
import { resolveMaisonPreviewHydration } from "./preview-hydration";
import { MAISON_SEED } from "./seed";

function seedStarterProfile(): TalentPortfolioStarterProfile {
  const sc = MAISON_SEED.demo_nails.site_content;
  const about = Array.isArray(sc.about) ? sc.about.filter((s): s is string => typeof s === "string") : [];
  const services = loadMaisonStarterCatalog().services;
  return {
    displayName: typeof sc.name === "string" && sc.name.trim() ? sc.name.trim() : "Lía Studio",
    profileCode: "MAISON-SEED",
    primaryTypeLabel: "Nail Artist",
    publicBio: typeof sc.intro === "string" ? sc.intro : null,
    richBio: about.join("\n\n") || (typeof sc.intro === "string" ? sc.intro : ""),
    homeCity: null,
    serviceAreaLabels: [],
    serviceNames: services.map((s) => s.name),
    headshotUrl: null,
    secondaryTypeLabels: [],
    languagesLabel: "Español",
  };
}

function seedOfferings(): TalentOffering[] {
  return loadMaisonStarterCatalog().services.map((s, i) => ({
    id: `maison-seed-${s.key}`,
    talentProfileId: "maison-seed",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: s.name,
    description: null,
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: Math.round(s.priceMxn * 100),
    currency: "MXN",
    bookingMode: "request",
    reserveMode: "deposit",
    depositPct: 25,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: 24,
    freeReserveExpiresDays: null,
    durationMinutes: s.durationMin,
    category: s.category,
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: "2026-01-01T00:00:00Z",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: i,
    attributes: {},
    imageUrls: [],
    variants: [],
    addOns: [],
  }));
}

/** Seed hydration for `?demo=maison:nails` (and any future maison-seed key). */
export function resolveMaisonSeedPreviewBundle(): {
  hydration: TemplatePreviewHydration;
  dataSources: BuilderNodeRenderDataSources;
} {
  const maison = resolveMaisonPreviewHydration({ mode: "demo" });
  const hydration = buildTemplatePreviewHydration(
    { profile: seedStarterProfile(), media: [] },
    { isReal: false },
  );
  // Prefer seed-authored headline / eyebrow / menu subtitle when present.
  const sc = MAISON_SEED.demo_nails.site_content;
  const headline = Array.isArray(sc.headline)
    ? sc.headline.filter((s): s is string => typeof s === "string").join(" ")
    : "";
  if (headline) hydration.tokens.headline = headline;
  if (typeof sc.eyebrow === "string" && sc.eyebrow.trim()) {
    hydration.tokens.heroEyebrow = sc.eyebrow.trim();
  }
  if (typeof sc.menu_sub === "string" && sc.menu_sub.trim()) {
    hydration.tokens.menuSubtitle = sc.menu_sub.trim();
  }
  if (typeof sc.intro === "string" && sc.intro.trim()) {
    hydration.tokens.tagline = sc.intro.trim();
  }
  return {
    hydration,
    dataSources: {
      talentFaqItems: maison.faqItems,
      talentOfferings: seedOfferings(),
    },
  };
}
