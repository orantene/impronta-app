/**
 * AtelierProfileLayout — "Atelier" minimal high-fashion MAGAZINE editorial
 * talent profile template.
 *
 * A drop-in alternative to LightProfileLayout / NoirProfileLayout: it accepts the
 * EXACT same props (LightProfileLayoutProps) so page.tsx can swap between them
 * with a single dispatch variable. Every live interactive slot (inquire /
 * instant-book, share, save/discovery, reviews, services pricing, lightbox,
 * similar talent) is preserved.
 *
 * Visual language — "Atelier":
 *   - A minimal editorial single column with very generous whitespace.
 *   - Centered masthead hero: tiny tracked eyebrow → VERY large Fraunces serif
 *     display name → a large centered 4:5 portrait inside a thin 1px inset frame
 *     → centered chips → centered CTAs.
 *   - NUMBERED sections ("01 — About", "02 — Measurements", …) with the accent
 *     color on the numerals + tracked uppercase labels.
 *   - ALL profile fields surfaced as a refined two-column definition list
 *     (muted uppercase label left, value right) with hairline row dividers.
 *   - Accents kept minimal: hairlines + the accent color for numerals / eyebrows
 *     / CTAs only.
 *
 * THEME — this is a theme-adaptive template. It uses buildAdaptiveThemeStyle()
 * to project the tenant's design tokens into a semantic --pp-* palette (plus
 * --plt-* overrides so reused sub-blocks adopt the same light/dark register +
 * accent). The template's own CSS consumes ONLY var(--pp-*) so it tracks
 * light/dark + the tenant accent automatically.
 *
 * Server component — pure presentational, no hooks or client-side state.
 */

import Image from "next/image";
import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";

import { ServicesBlock } from "../_light/ServicesBlock";
import { ServiceMenuBlock } from "../_light/ServiceMenuBlock";
import { TalentStorefront } from "../_shared/TalentStorefront";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { SkillsExperienceBlock } from "../_light/SkillsExperienceBlock";
import { AvailabilityWidget } from "../_light/AvailabilityWidget";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import { PublicFeaturedMedia } from "@/components/talent/connections/PublicFeaturedMedia";
import { TalentExtrasBands } from "../_shared/TalentExtrasBands";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TestimonialsSection } from "@/components/reviews/TestimonialsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { buildAdaptiveThemeStyle } from "../_shared/profile-theme";
import { heroRatingChipLabel, type LightProfileLayoutProps } from "../_light/LightProfileLayout";
import { ExclusiveRepresentationLine } from "../_shared/ExclusiveRepresentationLine";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";
import { ReviewsAnchorLink } from "../_shared/ReviewsAnchorLink";

type DetailRow = { key: string; label: string; value: string; group: string };

/** Group detail rows by their resolved group label, preserving first-seen order. */
function groupDetailRows(rows: DetailRow[]): Array<{ group: string; rows: DetailRow[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, DetailRow[]>();
  for (const row of rows) {
    const g = row.group;
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
    byGroup.get(g)!.push(row);
  }
  return order.map((group) => ({ group, rows: byGroup.get(group)! }));
}

/**
 * Letter-free person silhouette used as the no-photo portrait/avatar fallback.
 * Inherits `currentColor` from each `__mono`/`.mono` container so it keeps the
 * theme accent. `size` is the SVG width/height as a % of the (flex-centered)
 * container.
 */
function Silhouette({ size = "46%" }: { size?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.6 19.4c0-3.7 3.2-6.2 7.4-6.2s7.4 2.5 7.4 6.2c0 .5-.4.8-.9.8H5.5c-.5 0-.9-.3-.9-.8Z" />
    </svg>
  );
}

/** Two-digit section index, e.g. 1 → "01". */
function sectionNo(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Scoped Atelier styles. Every selector is namespaced under
// [data-profile-theme="atelier"] and consumes ONLY var(--pp-*) for colors.
const ATELIER_CSS = `
[data-profile-theme="atelier"]{
  --at-pad:clamp(20px,5vw,56px);
  --at-col:760px;
  background:var(--pp-bg); color:var(--pp-ink);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  font-weight:400; line-height:1.7; -webkit-font-smoothing:antialiased;
}
[data-profile-theme="atelier"] ::selection{ background:var(--pp-accent); color:var(--pp-accent-on); }
[data-profile-theme="atelier"] .at-display{ font-family:'Fraunces','Times New Roman',Georgia,serif; font-weight:340; letter-spacing:-0.01em; line-height:1.02; color:var(--pp-ink); }

[data-profile-theme="atelier"] .at-col{ width:100%; max-width:var(--at-col); margin-inline:auto; padding-inline:var(--at-pad); }
[data-profile-theme="atelier"] .at-wide{ width:100%; max-width:1100px; margin-inline:auto; padding-inline:var(--at-pad); }
[data-profile-theme="atelier"] .at-section{ padding-block:clamp(48px,8vw,104px); }

[data-profile-theme="atelier"] .at-eyebrow{ font-size:10.5px; letter-spacing:0.36em; text-transform:uppercase; font-weight:600; color:var(--pp-accent); }

/* numbered section header */
[data-profile-theme="atelier"] .at-head{ display:flex; align-items:baseline; gap:14px; margin-bottom:clamp(22px,3.4vw,40px); }
[data-profile-theme="atelier"] .at-head__no{ font-family:'Fraunces',serif; font-size:0.95rem; font-weight:500; color:var(--pp-accent); letter-spacing:0.04em; }
[data-profile-theme="atelier"] .at-head__dash{ width:18px; height:1px; background:var(--pp-line-strong); align-self:center; }
[data-profile-theme="atelier"] .at-head__label{ font-size:11px; letter-spacing:0.28em; text-transform:uppercase; font-weight:600; color:var(--pp-ink-soft); }
[data-profile-theme="atelier"] .at-head--center{ justify-content:center; }

/* buttons */
[data-profile-theme="atelier"] .at-btn{ display:inline-flex; align-items:center; gap:9px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; font-weight:600; padding:13px 28px; border-radius:1px; transition:color .25s ease, border-color .25s ease, background .25s ease; border:1px solid var(--pp-line-strong); color:var(--pp-ink); white-space:nowrap; cursor:pointer; text-decoration:none; }
[data-profile-theme="atelier"] .at-btn:hover{ border-color:var(--pp-accent); color:var(--pp-accent); }
[data-profile-theme="atelier"] .at-btn .arr{ transition:transform .25s ease; }
[data-profile-theme="atelier"] .at-btn:hover .arr{ transform:translateX(4px); }

/* ── hero ─────────────────────────────────────────────────────────── */
[data-profile-theme="atelier"] .at-hero{ text-align:center; padding-top:clamp(40px,7vh,92px); padding-bottom:clamp(8px,2vw,28px); }
[data-profile-theme="atelier"] .at-hero h1{ font-family:'Fraunces','Times New Roman',serif; font-weight:330; font-size:clamp(3rem,9vw,6.4rem); line-height:0.98; letter-spacing:-0.02em; margin-top:18px; }
[data-profile-theme="atelier"] .at-hero__sub{ color:var(--pp-ink-soft); margin-top:14px; font-size:clamp(0.95rem,1.6vw,1.1rem); }
[data-profile-theme="atelier"] .at-portrait{ position:relative; width:min(100%,440px); margin:clamp(28px,5vw,52px) auto 0; aspect-ratio:4/5; overflow:hidden; background:var(--pp-surface); }
[data-profile-theme="atelier"] .at-portrait img{ width:100%; height:100%; object-fit:cover; }
[data-profile-theme="atelier"] .at-portrait::after{ content:""; position:absolute; inset:12px; border:1px solid rgba(255,255,255,0.0); box-shadow:0 0 0 1px var(--pp-line-strong) inset; pointer-events:none; }
[data-profile-theme="atelier"] .at-portrait__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:300; font-size:clamp(4rem,11vw,8rem); color:var(--pp-muted); letter-spacing:0.06em; }

/* cover-led hero variant */
[data-profile-theme="atelier"] .at-cover{ position:relative; width:100%; min-height:clamp(440px,72vh,760px); display:flex; align-items:flex-end; justify-content:center; overflow:hidden; background:var(--pp-surface); }
[data-profile-theme="atelier"] .at-cover__bg{ position:absolute; inset:0; }
[data-profile-theme="atelier"] .at-cover__bg img{ width:100%; height:100%; object-fit:cover; }
[data-profile-theme="atelier"] .at-cover__scrim{ position:absolute; inset:0; background:linear-gradient(to top, var(--pp-scrim), transparent 64%); }
[data-profile-theme="atelier"] .at-cover__inner{ position:relative; z-index:2; text-align:center; padding:0 var(--at-pad) clamp(40px,7vw,84px); color:#fff; max-width:var(--at-col); }
[data-profile-theme="atelier"] .at-cover__inner .at-eyebrow{ color:#fff; }
[data-profile-theme="atelier"] .at-cover__inner h1{ font-family:'Fraunces',serif; font-weight:330; font-size:clamp(3rem,8.5vw,6rem); line-height:0.98; letter-spacing:-0.02em; margin-top:14px; color:#fff; }
[data-profile-theme="atelier"] .at-cover__inner .at-hero__sub{ color:rgba(255,255,255,0.86); }
[data-profile-theme="atelier"] .at-cover__inset{ position:relative; width:clamp(120px,22vw,180px); margin:clamp(20px,3vw,28px) auto 0; aspect-ratio:4/5; overflow:hidden; }
[data-profile-theme="atelier"] .at-cover__inset img{ width:100%; height:100%; object-fit:cover; }
[data-profile-theme="atelier"] .at-cover__inset::after{ content:""; position:absolute; inset:8px; box-shadow:0 0 0 1px rgba(255,255,255,0.55) inset; pointer-events:none; }
[data-profile-theme="atelier"] .at-cover .at-btn{ color:#fff; border-color:rgba(255,255,255,0.55); }
[data-profile-theme="atelier"] .at-cover .at-btn:hover{ border-color:#fff; color:#fff; }

/* split hero (portrait + intro, no cover) */
[data-profile-theme="atelier"] .at-split{ display:grid; grid-template-columns:0.9fr 1.1fr; gap:clamp(28px,5vw,64px); align-items:center; padding-top:clamp(36px,6vh,80px); }
[data-profile-theme="atelier"] .at-split__portrait{ position:relative; aspect-ratio:4/5; overflow:hidden; background:var(--pp-surface); }
[data-profile-theme="atelier"] .at-split__portrait img{ width:100%; height:100%; object-fit:cover; }
[data-profile-theme="atelier"] .at-split__portrait::after{ content:""; position:absolute; inset:12px; box-shadow:0 0 0 1px var(--pp-line-strong) inset; pointer-events:none; }
[data-profile-theme="atelier"] .at-split__intro h1{ font-family:'Fraunces',serif; font-weight:330; font-size:clamp(2.6rem,5.6vw,4.6rem); line-height:1.0; letter-spacing:-0.02em; margin-top:14px; }

[data-profile-theme="atelier"] .at-chips{ display:flex; gap:9px; flex-wrap:wrap; justify-content:center; margin-top:24px; }
[data-profile-theme="atelier"] .at-split__intro .at-chips,[data-profile-theme="atelier"] .at-split__intro .at-actions,[data-profile-theme="atelier"] .at-split__intro .at-extra{ justify-content:flex-start; }
[data-profile-theme="atelier"] .at-chip{ font-size:9.5px; letter-spacing:0.18em; text-transform:uppercase; font-weight:600; padding:6px 13px; border:1px solid var(--pp-line); border-radius:1px; color:var(--pp-ink-soft); }
[data-profile-theme="atelier"] .at-chip--accent{ border-color:var(--pp-accent); color:var(--pp-accent); }
[data-profile-theme="atelier"] a.at-chip{ text-decoration:none; transition:opacity .2s ease; } [data-profile-theme="atelier"] a.at-chip:hover{ opacity:0.78; }
html:has([data-profile-theme="atelier"]){ scroll-behavior:smooth; } [data-profile-theme="atelier"] #reviews{ scroll-margin-top:96px; }
[data-profile-theme="atelier"] .at-bio{ color:var(--pp-ink-soft); margin-top:20px; max-width:54ch; font-size:1.02rem; line-height:1.85; }
[data-profile-theme="atelier"] .at-hero .at-bio,[data-profile-theme="atelier"] .at-cover__inner .at-bio{ margin-inline:auto; }
[data-profile-theme="atelier"] .at-cover__inner .at-bio{ color:rgba(255,255,255,0.84); }
[data-profile-theme="atelier"] .at-actions{ display:flex; gap:11px; margin-top:28px; flex-wrap:wrap; justify-content:center; align-items:center; }
[data-profile-theme="atelier"] .at-extra{ display:flex; gap:16px; margin-top:22px; flex-wrap:wrap; justify-content:center; align-items:center; }

/* inline availability strip */
[data-profile-theme="atelier"] .at-avail{ display:flex; justify-content:center; margin-top:26px; }

/* definition list (all fields) */
[data-profile-theme="atelier"] .at-defgroup + .at-defgroup{ margin-top:clamp(28px,4vw,44px); }
[data-profile-theme="atelier"] .at-defgroup__label{ font-size:10px; letter-spacing:0.24em; text-transform:uppercase; font-weight:600; color:var(--pp-accent); margin-bottom:14px; }
[data-profile-theme="atelier"] .at-dl{ border-top:1px solid var(--pp-line); }
[data-profile-theme="atelier"] .at-dl__row{ display:grid; grid-template-columns:minmax(120px,0.42fr) 1fr; gap:18px; padding:13px 0; border-bottom:1px solid var(--pp-line); align-items:baseline; }
[data-profile-theme="atelier"] .at-dl__k{ font-size:10.5px; letter-spacing:0.16em; text-transform:uppercase; font-weight:600; color:var(--pp-muted); }
[data-profile-theme="atelier"] .at-dl__v{ font-size:1rem; color:var(--pp-ink); word-break:break-word; }

/* about */
[data-profile-theme="atelier"] .at-about{ font-family:'Fraunces',serif; font-weight:340; font-size:clamp(1.25rem,2.4vw,1.7rem); line-height:1.5; color:var(--pp-ink); max-width:40ch; }

/* similar (quiet roster row) */
[data-profile-theme="atelier"] .at-similar{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
[data-profile-theme="atelier"] .at-similar__card{ position:relative; }
[data-profile-theme="atelier"] .at-similar__media{ position:relative; aspect-ratio:3/4; overflow:hidden; background:var(--pp-surface); display:block; }
[data-profile-theme="atelier"] .at-similar__media img{ width:100%; height:100%; object-fit:cover; transition:transform .9s cubic-bezier(0.16,1,0.3,1); }
[data-profile-theme="atelier"] .at-similar__card:hover .at-similar__media img{ transform:scale(1.03); }
[data-profile-theme="atelier"] .at-similar__cap{ margin-top:10px; }
[data-profile-theme="atelier"] .at-similar__cap .nm{ font-family:'Fraunces',serif; font-size:1.05rem; color:var(--pp-ink); }
[data-profile-theme="atelier"] .at-similar__cap .ct{ font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:var(--pp-muted); margin-top:3px; }
[data-profile-theme="atelier"] .at-similar__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; color:var(--pp-muted); font-size:2rem; }

/* cta */
[data-profile-theme="atelier"] .at-cta{ border-top:1px solid var(--pp-line); border-bottom:1px solid var(--pp-line); text-align:center; }
[data-profile-theme="atelier"] .at-cta h2{ font-family:'Fraunces',serif; font-weight:330; font-size:clamp(2.2rem,5vw,4rem); line-height:1.02; letter-spacing:-0.02em; margin:14px auto 12px; max-width:16ch; }
[data-profile-theme="atelier"] .at-cta p{ color:var(--pp-ink-soft); max-width:44ch; margin:0 auto 28px; }
[data-profile-theme="atelier"] .at-cta__btns{ display:flex; gap:12px; justify-content:center; flex-wrap:wrap; align-items:center; }

/* footer */
[data-profile-theme="atelier"] .at-foot{ border-top:1px solid var(--pp-line); padding-block:clamp(36px,5vw,64px); }
[data-profile-theme="atelier"] .at-foot__row{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
[data-profile-theme="atelier"] .at-foot__pw{ font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--pp-muted); }
[data-profile-theme="atelier"] .at-foot__pw em{ font-style:normal; color:var(--pp-accent); }

/* preview banner */
[data-profile-theme="atelier"] .at-preview-banner{ border-bottom:1px solid var(--pp-line); background:var(--pp-surface); color:var(--pp-muted); text-align:center; padding:11px 16px; font-size:10.5px; letter-spacing:0.22em; text-transform:uppercase; }

/* sticky bar */
[data-profile-theme="atelier"] .at-bookbar{ position:sticky; bottom:0; z-index:40; background:color-mix(in srgb, var(--pp-bg) 92%, transparent); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px var(--at-pad); flex-wrap:wrap; border-top:1px solid var(--pp-line); }
[data-profile-theme="atelier"] .at-bookbar .who{ display:flex; align-items:center; gap:13px; min-width:0; }
[data-profile-theme="atelier"] .at-bookbar .who img{ width:42px; height:42px; border-radius:50%; object-fit:cover; border:1px solid var(--pp-line-strong); }
[data-profile-theme="atelier"] .at-bookbar .who .mono{ width:42px; height:42px; border-radius:50%; border:1px solid var(--pp-line-strong); display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; color:var(--pp-accent); }
[data-profile-theme="atelier"] .at-bookbar .who .n{ font-family:'Fraunces',serif; font-size:1.2rem; line-height:1; color:var(--pp-ink); }
[data-profile-theme="atelier"] .at-bookbar .who .s{ font-size:9.5px; letter-spacing:0.16em; text-transform:uppercase; color:var(--pp-muted); margin-top:3px; }

/* Reused sub-blocks render their own heading; Atelier supplies its own numbered
   header instead (we pass heading=""/headingLabel=""), so suppress the block
   heading element to remove the empty node + close the gap. */
[data-profile-theme="atelier"] #skills-exp-heading,
[data-profile-theme="atelier"] #services-heading,
[data-profile-theme="atelier"] #service-menu-heading,
[data-profile-theme="atelier"] #featured-media-heading{ display:none !important; }
[data-profile-theme="atelier"] section[aria-label="Client reviews"] > div:first-of-type{ display:none !important; }

@media (max-width:760px){
  [data-profile-theme="atelier"] .at-split{ grid-template-columns:1fr; text-align:center; }
  [data-profile-theme="atelier"] .at-split__intro .at-chips,[data-profile-theme="atelier"] .at-split__intro .at-actions,[data-profile-theme="atelier"] .at-split__intro .at-extra{ justify-content:center; }
  [data-profile-theme="atelier"] .at-similar{ grid-template-columns:repeat(2,1fr); }
  [data-profile-theme="atelier"] .at-dl__row{ grid-template-columns:1fr; gap:4px; }
}
`;

export function AtelierProfileLayout(props: LightProfileLayoutProps) {
  const {
    name,
    firstName,
    profileImageUrl,
    bannerUrl,
    isFeatured,
    aboutText,
    allTalentTypes,
    primaryType,
    livesIn,
    languages,
    locale,
    talentPlanKey,
    maxSiteUrl,
    galleryItems,
    watermarkPreset,
    watermarkLogoUrl,
    featuredMediaItems,
    resolvedSkills,
    availableDaysInNext30,
    availabilityDots14d,
    nextAvailableDate,
    packageTeasers,
    serviceAreas,
    startingFrom,
    bookingNote,
    serviceMenuItems,
    storefrontOfferings,
    disciplineLabels,
    fitLabels,
    skills,
    industries,
    eventTypes,
    tags,
    fieldVisibility,
    basicInfoDetailRows,
    otherDetailRows,
    ratingSummary,
    talentReviews,
    testimonials = [],
    heroRating,
    agencyName,
    agencyDisplayName,
    similarTalent,
    ui,
    t,
    detailsLabels,
    profileSourcePage,
    resolvedPreview,
    showFooter,
    inquireButtonHeader,
    inquireButtonFooter,
    shareMenuHeader,
    discoveryCta,
    discoveryCta3,
    hubsIndicator,
  } = props;

  const mode = props.themeMode ?? "light";
  const themeStyle = buildAdaptiveThemeStyle(mode, props.themeVars);
  const reviewsTheme = mode === "dark" ? "dark" : "light";

  const isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic";
  const agency = agencyDisplayName ?? agencyName;
  const hasCover = Boolean(bannerUrl);
  const hasPortrait = Boolean(profileImageUrl);

  // Hero chips -----------------------------------------------------------
  const langShort = languages
    .map((l) => l.split(" (")[0].trim())
    .filter(Boolean)
    .slice(0, 4);
  const travels = serviceAreas.some((s) => s.service_kind === "travel_to");
  const eyebrowLine =
    allTalentTypes.length > 0 ? allTalentTypes.join(" · ") : primaryType ?? "";

  // Detail groups (surface ALL fields) -----------------------------------
  const groupedBasic =
    basicInfoDetailRows.length > 0
      ? [{ group: detailsLabels.measurements, rows: basicInfoDetailRows }]
      : [];
  const detailGroups = [...groupedBasic, ...groupDetailRows(otherDetailRows)];

  const hasAbout = aboutText.trim().length > 0;
  const hasDetails = detailGroups.length > 0;
  const hasAvailability =
    availableDaysInNext30 != null ||
    availabilityDots14d != null ||
    nextAvailableDate != null;

  const hasSkills =
    resolvedSkills.length > 0 ||
    (fieldVisibility.showFitLabels && fitLabels.length > 0) ||
    (fieldVisibility.showSkills && skills.length > 0) ||
    (fieldVisibility.showIndustries && industries.length > 0) ||
    (fieldVisibility.showEventTypes && eventTypes.length > 0) ||
    (fieldVisibility.showTags && tags.length > 0);

  const hasServices =
    !isFreePlan &&
    (packageTeasers.length > 0 ||
      serviceAreas.length > 0 ||
      Boolean(startingFrom) ||
      Boolean(bookingNote));
  const hasStorefront = !isFreePlan && storefrontOfferings.length > 0;
  const hasServiceMenu = hasStorefront || (!isFreePlan && serviceMenuItems.length > 0);
  const hasFeaturedMedia = featuredMediaItems.length > 0;
  const hasPortfolio = galleryItems.length > 0;
  const hasReviews = ratingSummary.count > 0;
  const hasSimilar = similarTalent.length > 0;

  const labels = {
    about: pickLocale(locale, { en: "About", es: "Acerca de" }),
    measurements: detailsLabels.measurements,
    portfolio: pickLocale(locale, { en: "Portfolio", es: "Portafolio" }),
    skills: pickLocale(locale, { en: "Skills & Specialties", es: "Habilidades" }),
    services: pickLocale(locale, { en: "Services & Rates", es: "Servicios y Tarifas" }),
    featured: pickLocale(locale, { en: "Featured", es: "Destacado" }),
    availability: pickLocale(locale, { en: "Availability", es: "Disponibilidad" }),
    reviews: pickLocale(locale, { en: "Reviews", es: "Reseñas" }),
    roster: pickLocale(locale, { en: "More from this roster", es: "Más de este roster" }),
    represented: pickLocale(locale, { en: "Represented", es: "Representada" }),
    travels: pickLocale(locale, { en: "Travels worldwide", es: "Viaja a todo el mundo" }),
    featuredChip: ui.card.featuredLabel,
    viewPortfolio: pickLocale(locale, { en: "View portfolio", es: "Ver portafolio" }),
    visitSite: pickLocale(locale, { en: "Visit my site", es: "Visita mi sitio" }),
    works: pickLocale(locale, { en: "works", es: "trabajos" }),
  };

  // Running section counter (numbered "01 — …" labels).
  let secCounter = 0;
  const nextNo = () => sectionNo(++secCounter);

  const chips = (
    <>
    <div className="at-chips">
      {heroRating && meetsCredibilityFloor(heroRating.ratingCount) ? (
        <ReviewsAnchorLink className="at-chip at-chip--accent">
          {heroRatingChipLabel(heroRating.ratingAvg, heroRating.ratingCount, locale)}
        </ReviewsAnchorLink>
      ) : null}
      {livesIn ? <span className="at-chip">{livesIn}</span> : null}
      {agency ? <span className="at-chip at-chip--accent">{labels.represented}</span> : null}
      {langShort.length > 0 ? <span className="at-chip">{langShort.join(" · ")}</span> : null}
      {travels ? <span className="at-chip">{labels.travels}</span> : null}
      {isFeatured ? <span className="at-chip at-chip--accent">{labels.featuredChip}</span> : null}
    </div>
    {agency && props.isExclusive ? (
      // Sits inside `chips` so it follows the hero into BOTH layouts (cover-led
      // and split) without duplicating the conditional at each call site. The
      // split hero left-aligns its chips, so inherit alignment rather than
      // hard-centering here.
      <div className="at-chips" style={{ marginTop: 12 }}>
        <ExclusiveRepresentationLine
          agency={agency}
          t={props.t}
          className="text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--pp-muted)" }}
        />
      </div>
    ) : null}
    </>
  );

  const actions = (
    <>
      <div className="at-actions">
        {inquireButtonHeader}
        {hasPortfolio ? (
          <a href="#at-portfolio" className="at-btn">
            {labels.viewPortfolio}
          </a>
        ) : null}
        {maxSiteUrl ? (
          <a href={maxSiteUrl} target="_blank" rel="noopener noreferrer" className="at-btn">
            {labels.visitSite} <span className="arr">→</span>
          </a>
        ) : null}
      </div>
      <div className="at-extra">
        {shareMenuHeader}
        {discoveryCta}
        {hubsIndicator}
      </div>
    </>
  );

  return (
    <main
      id="main-content"
      className="flex-1"
      style={themeStyle as React.CSSProperties}
      data-profile-shell
      data-profile-theme="atelier"
    >
      {/* Fonts + scoped Atelier styles */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Page-scoped on purpose — Fraunces is loaded only on Atelier profiles, not
          globally. fonts.googleapis.com is already CSP-allowed (see
          app/google-fonts-link.tsx + builder render.tsx). */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,340;9..144,400;9..144,500&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: ATELIER_CSS }} />

      {resolvedPreview ? (
        <div className="at-preview-banner">{t("public.profile.previewModeBanner")}</div>
      ) : null}

      {/* ── HERO (adaptive) ──────────────────────────────────────────────── */}
      {hasCover ? (
        // Cover-led hero — name/eyebrow/chips/CTAs overlaid on the cover.
        <section className="at-cover" data-profile-section="hero">
          <div className="at-cover__bg">
            <Image
              src={bannerUrl as string}
              alt={`${name}, cover`}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className="at-cover__scrim" aria-hidden="true" />
          <div className="at-cover__inner">
            {eyebrowLine ? <span className="at-eyebrow">{eyebrowLine}</span> : null}
            <h1>{name}</h1>
            {hasPortrait ? (
              <div className="at-cover__inset">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profileImageUrl as string} alt={`${name}, portrait`} />
              </div>
            ) : null}
            {chips}
            {hasAbout ? <p className="at-bio">{aboutText}</p> : null}
            {actions}
          </div>
        </section>
      ) : hasPortrait ? (
        // Split hero — portrait + intro.
        <section className="at-wide at-split" data-profile-section="hero">
          <div className="at-split__portrait">
            <Image
              src={profileImageUrl as string}
              alt={`${name}, portrait`}
              fill
              priority
              sizes="(min-width: 760px) 45vw, 100vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className="at-split__intro">
            {eyebrowLine ? <span className="at-eyebrow">{eyebrowLine}</span> : null}
            <h1>{name}</h1>
            {chips}
            {hasAbout ? <p className="at-bio">{aboutText}</p> : null}
            {actions}
          </div>
        </section>
      ) : (
        // Text-only masthead — no images at all. Silhouette, never a gray box.
        <section className="at-col at-hero" data-profile-section="hero">
          {eyebrowLine ? <span className="at-eyebrow">{eyebrowLine}</span> : null}
          <h1>{name}</h1>
          <div className="at-portrait">
            <div className="at-portrait__mono" aria-hidden="true">
              <Silhouette />
            </div>
          </div>
          {chips}
          {hasAbout ? <p className="at-bio">{aboutText}</p> : null}
          {actions}
        </section>
      )}

      {/* ── AVAILABILITY (inline centered strip) ─────────────────────────── */}
      {hasAvailability ? (
        <section className="at-col" style={{ paddingBlock: "clamp(8px,2vw,20px)" }}>
          <div className="at-avail">
            <AvailabilityWidget
              availableDaysInNext30={availableDaysInNext30}
              availabilityDots14d={availabilityDots14d}
              nextAvailableDate={nextAvailableDate}
            />
          </div>
        </section>
      ) : null}

      {/* ── ABOUT ────────────────────────────────────────────────────────── */}
      {hasAbout ? (
        <section className="at-col at-section" data-profile-section="about">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.about}</span>
          </div>
          <p className="at-about">{aboutText}</p>
        </section>
      ) : null}

      {/* ── MEASUREMENTS / ALL FIELDS (definition list) ──────────────────── */}
      {hasDetails ? (
        <section className="at-col at-section" data-profile-section="details">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.measurements}</span>
          </div>
          {detailGroups.map((g, i) => (
            <div className="at-defgroup" key={g.group}>
              {i > 0 ? <div className="at-defgroup__label">{g.group}</div> : null}
              <dl className="at-dl">
                {g.rows.map((r) => (
                  <div className="at-dl__row" key={r.key}>
                    <dt className="at-dl__k">{r.label}</dt>
                    <dd className="at-dl__v">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ) : null}

      {/* ── SKILLS & SPECIALTIES ─────────────────────────────────────────── */}
      {hasSkills ? (
        <section className="at-col at-section" data-profile-section="skills">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.skills}</span>
          </div>
          <SkillsExperienceBlock
            resolvedSkills={resolvedSkills}
            fitLabels={fitLabels}
            skills={skills}
            industries={industries}
            eventTypes={eventTypes}
            tags={tags}
            locale={locale}
            showFitLabels={fieldVisibility.showFitLabels}
            showSkills={fieldVisibility.showSkills}
            showIndustries={fieldVisibility.showIndustries}
            showEventTypes={fieldVisibility.showEventTypes}
            showTags={fieldVisibility.showTags}
            headingLabel=""
          />
        </section>
      ) : null}

      {/* ── SERVICES + pricing (plan-gated) ──────────────────────────────── */}
      {hasServices || hasServiceMenu ? (
        <section className="at-col at-section" data-profile-section="services">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.services}</span>
          </div>
          {hasServices ? (
            <ServicesBlock
              packageTeasers={packageTeasers}
              serviceAreas={serviceAreas}
              startingFrom={startingFrom}
              bookingNote={bookingNote}
              locale={locale}
              heading=""
              packagesLabel={t("public.profile.editorial.packages")}
              bookingDetailsLabel={t("public.profile.editorial.bookingDetails")}
            />
          ) : null}
          {hasServiceMenu ? (
            <div style={{ marginTop: hasServices ? 28 : 0 }}>
              {hasStorefront ? (
                <TalentStorefront
                  offerings={storefrontOfferings}
                  locale={locale}
                  heading={pickLocale(locale, { en: "Services & pricing", es: "Servicios y precios" })}
                />
              ) : (
                <ServiceMenuBlock
                  items={serviceMenuItems}
                  locale={locale}
                  heading={pickLocale(locale, { en: "Services & pricing", es: "Servicios y precios" })}
                  disciplineLabels={disciplineLabels}
                />
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── PORTFOLIO (wide editorial gallery) ───────────────────────────── */}
      {hasPortfolio ? (
        <section id="at-portfolio" className="at-wide at-section" data-profile-section="portfolio">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.portfolio}</span>
          </div>
          <PortfolioGalleryLightbox
            name={name}
            items={galleryItems.slice(0, 12)}
            lightbox={ui.lightbox}
            closeLabel={ui.preview.close}
            watermarkPreset={watermarkPreset}
            watermarkLogoUrl={watermarkLogoUrl}
          />
        </section>
      ) : null}

      {/* ── FEATURED MEDIA / INTEGRATIONS ────────────────────────────────── */}
      {hasFeaturedMedia ? (
        <section className="at-col at-section" data-profile-section="featured-media">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.featured}</span>
          </div>
          <PublicFeaturedMedia items={featuredMediaItems} heading="" />
        </section>
      ) : null}

      <TalentExtrasBands family="atelier" locale={locale} embeds={props.talentEmbeds} press={props.talentPressItems} nextNo={nextNo} />

      {/* ── REVIEWS ──────────────────────────────────────────────────────── */}
      {hasReviews ? (
        <section id="reviews" className="at-col at-section" aria-label="Client reviews" data-profile-section="reviews">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.reviews}</span>
          </div>
          <TalentReviewsSection
            summary={ratingSummary}
            reviews={talentReviews}
            theme={reviewsTheme}
            heading=""
            talentName={name}
          />
        </section>
      ) : null}

      {/* ── INVITED TESTIMONIALS (separate from verified reviews) ────────── */}
      {testimonials.length > 0 ? (
        <section
          className="at-col at-section"
          aria-label="Invited testimonials"
          data-profile-section="testimonials"
        >
          <TestimonialsSection testimonials={testimonials} theme={reviewsTheme} />
        </section>
      ) : null}

      {/* ── MORE FROM THIS ROSTER (quiet row) ────────────────────────────── */}
      {hasSimilar ? (
        <section className="at-wide at-section" aria-label="More talent from this roster">
          <div className="at-head">
            <span className="at-head__no">{nextNo()}</span>
            <span className="at-head__dash" aria-hidden="true" />
            <span className="at-head__label">{labels.roster}</span>
          </div>
          <div className="at-similar">
            {similarTalent.map((st) => (
              <div key={st.id} className="at-similar__card">
                <Link href={st.href} className="at-similar__media">
                  {st.thumbnailUrl ? (
                    <Image
                      src={st.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(min-width: 760px) 25vw, 50vw"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div className="at-similar__mono" aria-hidden="true">
                      <Silhouette />
                    </div>
                  )}
                </Link>
                <div className="at-similar__cap">
                  <div className="nm">{st.displayName}</div>
                  {st.primaryType ? <div className="ct">{st.primaryType}</div> : null}
                </div>
                <TalentCardActions
                  talentProfileId={st.id}
                  profileCode={st.profileCode}
                  displayName={st.displayName}
                  sourcePage={profileSourcePage}
                  variant="compact"
                  locale={locale}
                  className="absolute right-2.5 top-2.5 z-[2]"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="at-cta at-section" aria-label={t("public.profile.ctaSectionAria")}>
        <div className="at-col">
          <span className="at-eyebrow">{ui.common.brand}</span>
          <h2>{t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}</h2>
          <p>{t("public.profile.footerCtaBody")}</p>
          <div className="at-cta__btns">
            {inquireButtonFooter}
            {discoveryCta3}
          </div>
        </div>
      </section>

      {/* ── FOOTER (agency host only) ────────────────────────────────────── */}
      {showFooter ? (
        <footer className="at-foot">
          <div className="at-wide">
            <div className="at-foot__row">
              <div
                className="text-center sm:text-left"
                style={{ color: "var(--pp-muted)", fontSize: 13 }}
              >
                <PublicCmsFooterNav locale={locale} />
              </div>
              {props.whitelabel ? null : (
                <span className="at-foot__pw">
                  Powered by <em>Tulala</em>
                </span>
              )}
            </div>
          </div>
        </footer>
      ) : null}

      {/* ── STICKY BOOK BAR ──────────────────────────────────────────────── */}
      <div className="at-bookbar" data-profile-sticky-bar="visible">
        <div className="who">
          {profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileImageUrl} alt="" />
          ) : (
            <span className="mono"><Silhouette size="60%" /></span>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="n">{name}</div>
            <div className="s">
              {agency
                ? pickLocale(locale, {
                    en: `Represented by ${agency}`,
                    es: `Representada por ${agency}`,
                  })
                : primaryType ?? ""}
            </div>
          </div>
        </div>
        {inquireButtonFooter}
      </div>
    </main>
  );
}
