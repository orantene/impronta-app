/**
 * NoirProfileLayout — "Noir & Or" editorial talent profile template.
 *
 * A drop-in alternative to LightProfileLayout: it accepts the EXACT same props
 * (LightProfileLayoutProps) so page.tsx can swap between them with a single
 * dispatch variable. Every live interactive slot (inquire / instant-book,
 * share, save/discovery, guest chat is mounted separately, reviews, services
 * pricing, lightbox, similar talent) is preserved.
 *
 * Visual language ported from web/public/impronta-mockup-3 ("Noir & Or"):
 *   - Near-black ground (#0b0a0d) + warm ivory ink (#ece4d3)
 *   - Gold (#c6a14e) / champagne (#e0c074) accents, gold hairlines
 *   - Cormorant Garamond display + Jost sans
 *   - Gold inset frames on media, 2px-radius gold-gradient CTAs
 *
 * The shell overrides the global `--plt-*` design tokens to the Noir palette so
 * the reused functional sub-blocks (ServicesBlock, ServiceMenuBlock, reviews,
 * the portfolio lightbox, the passed-in gold inquire buttons) inherit the dark
 * theme automatically rather than being re-implemented.
 *
 * Server component — pure presentational, no hooks or client-side state.
 *
 * Sections (top → bottom):
 *   1. HERO — split portrait + intro (name, chips, bio, gold CTAs, availability)
 *   2. DIGITALS — measurements / detail groups in a gold-hairline grid
 *   3. SKILLS & SPECIALTIES (taxonomy chips, reused block)
 *   4. SERVICES + pricing (reused blocks, plan-gated)
 *   5. PORTFOLIO — editorial gallery (reused lightbox, watermark-aware)
 *   6. WATCH / LISTEN — talent-selected featured media
 *   7. CLIENTS — "select clients" band derived from industries
 *   8. REVIEWS (reused dark reviews block)
 *   9. MORE FROM THIS ROSTER — similar talent
 *  10. CTA — "Request availability"
 *  11. FOOTER (agency host only)
 *  12. STICKY BOOK BAR
 */

import Image from "next/image";
import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";

import { ServicesBlock } from "../_light/ServicesBlock";
import { ServiceMenuBlock } from "../_light/ServiceMenuBlock";
import { SkillsExperienceBlock } from "../_light/SkillsExperienceBlock";
import { AvailabilityWidget } from "../_light/AvailabilityWidget";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import { PublicFeaturedMedia } from "@/components/talent/connections/PublicFeaturedMedia";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { NoirReveal } from "./NoirReveal";
import type { LightProfileLayoutProps } from "../_light/LightProfileLayout";

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

/**
 * Noir palette as `--plt-*` overrides. Applied inline on the shell root so it
 * cascades to every descendant (including reused light-theme sub-blocks).
 */
const noirVars: Record<string, string> = {
  // surfaces
  "--plt-bg": "#0b0a0d",
  "--plt-bg-raised": "#161320",
  "--plt-bg-elevated": "#1b1722",
  "--plt-bg-deep": "#100e13",
  "--plt-bg-inverse": "#ece4d3",
  "--plt-bg-inverse-soft": "rgba(236,228,211,0.12)",
  // ink
  "--plt-ink": "#ece4d3",
  "--plt-ink-soft": "rgba(236,228,211,0.74)",
  "--plt-ink-strong": "#fbf5e8",
  "--plt-muted": "rgba(236,228,211,0.6)",
  "--plt-muted-soft": "rgba(236,228,211,0.44)",
  "--plt-on-inverse": "#161108",
  "--plt-on-inverse-muted": "rgba(22,17,8,0.66)",
  "--plt-on-inverse-soft": "rgba(22,17,8,0.82)",
  // hairlines (gold)
  "--plt-hairline": "rgba(198,161,78,0.26)",
  "--plt-hairline-strong": "rgba(198,161,78,0.46)",
  "--plt-hairline-inverse": "rgba(236,228,211,0.16)",
  "--plt-hairline-inverse-strong": "rgba(236,228,211,0.3)",
  // accent (forest → gold)
  "--plt-forest": "#c6a14e",
  "--plt-forest-deep": "#9c7d35",
  "--plt-forest-bright": "#e0c074",
  "--plt-forest-soft": "rgba(198,161,78,0.14)",
  "--plt-forest-ring": "rgba(198,161,78,0.4)",
  "--plt-forest-glow": "rgba(198,161,78,0.28)",
  "--plt-forest-on": "#161108",
  "--plt-accent": "#e0c074",
  "--plt-accent-soft": "rgba(224,192,116,0.4)",
  // shadows
  "--plt-shadow-sm": "0 4px 14px -10px rgba(0,0,0,0.7)",
  "--plt-shadow-md": "0 12px 30px -18px rgba(0,0,0,0.75)",
  "--plt-shadow-lg": "0 26px 60px -34px rgba(0,0,0,0.85)",
  "--plt-shadow-forest": "0 14px 34px -18px rgba(198,161,78,0.55)",
  // fonts
  "--plt-font-display": "'Cormorant Garamond', Georgia, serif",
  "--plt-font-body": "'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  "--plt-font-sans": "'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  "--plt-font-mono": "'Jost', sans-serif",
  // radii — Noir is sharp
  "--plt-radius-sm": "2px",
  "--plt-radius-md": "2px",
  "--plt-radius-lg": "3px",
  "--plt-radius-xl": "4px",
};

// Scoped Noir styles. Every selector is namespaced under [data-profile-theme="noir"].
const NOIR_CSS = `
[data-profile-theme="noir"]{
  --nf-gold:#c6a14e; --nf-champagne:#e0c074; --nf-line:rgba(198,161,78,0.26);
  --nf-ease:cubic-bezier(0.16,1,0.3,1);
  --nf-pad:clamp(20px,5vw,64px);
  background:#0b0a0d; color:#ece4d3;
  font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-weight:300; line-height:1.65; -webkit-font-smoothing:antialiased;
}
[data-profile-theme="noir"] ::selection{ background:var(--nf-gold); color:#14110a; }
[data-profile-theme="noir"] .plt-display,[data-profile-theme="noir"] .nf-display{ font-family:'Cormorant Garamond',Georgia,serif; font-weight:600; letter-spacing:0; line-height:1.04; color:#ece4d3; }
[data-profile-theme="noir"] .plt-mono{ font-family:'Jost',sans-serif; }
[data-profile-theme="noir"] .nf-wrap{ width:100%; max-width:1200px; margin-inline:auto; padding-inline:var(--nf-pad); }
[data-profile-theme="noir"] .nf-section{ padding-block:clamp(54px,8vw,108px); }
[data-profile-theme="noir"] .nf-eyebrow{ font-size:11px; letter-spacing:0.34em; text-transform:uppercase; font-weight:500; color:var(--nf-champagne); display:inline-flex; align-items:center; gap:12px; }
[data-profile-theme="noir"] .nf-eyebrow::before{ content:""; width:30px; height:1px; background:var(--nf-gold); display:inline-block; }
[data-profile-theme="noir"] .nf-sec-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:32px; flex-wrap:wrap; margin-bottom:clamp(28px,4vw,52px); }
[data-profile-theme="noir"] .nf-sec-head h2{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(1.9rem,3.6vw,3rem); margin-top:14px; max-width:18ch; }
[data-profile-theme="noir"] .nf-sec-head__aside{ max-width:38ch; color:rgba(236,228,211,0.66); font-size:0.95rem; padding-bottom:6px; }

/* buttons */
[data-profile-theme="noir"] .nf-btn{ display:inline-flex; align-items:center; gap:10px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; font-weight:500; padding:14px 30px; border-radius:2px; transition:all .4s var(--nf-ease); border:1px solid transparent; white-space:nowrap; cursor:pointer; }
[data-profile-theme="noir"] .nf-btn--ghost{ border-color:var(--nf-line); color:#ece4d3; }
[data-profile-theme="noir"] .nf-btn--ghost:hover{ border-color:var(--nf-gold); color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-btn .arr{ transition:transform .4s var(--nf-ease); }
[data-profile-theme="noir"] .nf-btn:hover .arr{ transform:translateX(5px); }

/* hero */
[data-profile-theme="noir"] .nf-hero{ display:grid; grid-template-columns:1fr 1fr; gap:clamp(28px,5vw,72px); align-items:stretch; padding-top:clamp(40px,7vh,96px); padding-bottom:clamp(20px,3vw,40px); }
[data-profile-theme="noir"] .nf-portrait{ position:relative; aspect-ratio:4/5; overflow:hidden; background:#1b1722; }
[data-profile-theme="noir"] .nf-portrait img{ width:100%; height:100%; object-fit:cover; filter:brightness(0.95); }
[data-profile-theme="noir"] .nf-portrait::after{ content:""; position:absolute; inset:14px; border:1px solid rgba(224,192,116,0.45); pointer-events:none; }
[data-profile-theme="noir"] .nf-portrait__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; font-size:clamp(4rem,10vw,8rem); color:rgba(224,192,116,0.5); letter-spacing:0.08em; }
[data-profile-theme="noir"] .nf-intro{ display:flex; flex-direction:column; justify-content:center; min-width:0; }
[data-profile-theme="noir"] .nf-intro h1{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(2.8rem,6.2vw,5.2rem); line-height:1.0; margin-top:16px; }
[data-profile-theme="noir"] .nf-chips{ display:flex; gap:10px; flex-wrap:wrap; margin-top:22px; }
[data-profile-theme="noir"] .nf-chip{ font-size:10px; letter-spacing:0.16em; text-transform:uppercase; font-weight:500; padding:7px 15px; border:1px solid var(--nf-line); border-radius:2px; color:rgba(236,228,211,0.74); }
[data-profile-theme="noir"] .nf-chip--gold{ border-color:rgba(224,192,116,0.55); color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-bio{ color:rgba(236,228,211,0.74); margin-top:24px; max-width:50ch; font-size:1rem; line-height:1.8; }
[data-profile-theme="noir"] .nf-actions{ display:flex; gap:12px; margin-top:32px; flex-wrap:wrap; align-items:center; }
[data-profile-theme="noir"] .nf-hero-extra{ margin-top:26px; display:flex; gap:18px; flex-wrap:wrap; align-items:center; }

/* digitals */
[data-profile-theme="noir"] .nf-digitals{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:1px; background:var(--nf-line); border:1px solid var(--nf-line); }
[data-profile-theme="noir"] .nf-digitals + .nf-digitals{ margin-top:1px; }
[data-profile-theme="noir"] .nf-digitals .d{ background:#100e13; padding:22px 20px; min-width:0; }
[data-profile-theme="noir"] .nf-digitals .d .k{ font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-digitals .d .v{ font-family:'Cormorant Garamond',serif; font-size:1.5rem; margin-top:8px; color:#ece4d3; word-break:break-word; }
[data-profile-theme="noir"] .nf-group-label{ font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:rgba(236,228,211,0.5); margin:26px 0 12px; }

/* clients */
[data-profile-theme="noir"] .nf-clients{ display:flex; flex-wrap:wrap; gap:14px 40px; align-items:center; }
[data-profile-theme="noir"] .nf-clients span{ font-family:'Cormorant Garamond',serif; font-size:clamp(1.3rem,2vw,1.9rem); color:#ece4d3; opacity:0.8; }

/* similar */
[data-profile-theme="noir"] .nf-similar{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
[data-profile-theme="noir"] .nf-similar__card{ position:relative; }
[data-profile-theme="noir"] .nf-similar__media{ position:relative; aspect-ratio:3/4; overflow:hidden; background:#100e13; border:1px solid transparent; transition:border-color .5s; display:block; }
[data-profile-theme="noir"] .nf-similar__card:hover .nf-similar__media{ border-color:var(--nf-line); }
[data-profile-theme="noir"] .nf-similar__media img{ width:100%; height:100%; object-fit:cover; transition:transform 1s var(--nf-ease); filter:brightness(0.9); }
[data-profile-theme="noir"] .nf-similar__card:hover .nf-similar__media img{ transform:scale(1.04); }
[data-profile-theme="noir"] .nf-similar__cap{ position:absolute; left:0; right:0; bottom:0; padding:14px; background:linear-gradient(transparent,rgba(8,7,10,0.84)); }
[data-profile-theme="noir"] .nf-similar__cap .nm{ font-family:'Cormorant Garamond',serif; font-size:1.15rem; color:#fff; }
[data-profile-theme="noir"] .nf-similar__cap .ct{ font-size:9.5px; letter-spacing:0.18em; text-transform:uppercase; color:var(--nf-champagne); margin-top:4px; }

/* cta */
[data-profile-theme="noir"] .nf-cta{ position:relative; overflow:hidden; background:#100e13; border-top:1px solid var(--nf-line); border-bottom:1px solid var(--nf-line); }
[data-profile-theme="noir"] .nf-cta__inner{ position:relative; z-index:2; text-align:center; padding-block:clamp(70px,11vw,150px); }
[data-profile-theme="noir"] .nf-cta__inner::before{ content:""; position:absolute; inset:clamp(16px,3vw,38px); border:1px solid rgba(224,192,116,0.4); pointer-events:none; }
[data-profile-theme="noir"] .nf-cta h2{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(2.4rem,5.4vw,4.6rem); line-height:1.0; margin:18px 0 14px; }
[data-profile-theme="noir"] .nf-cta p{ color:rgba(236,228,211,0.74); max-width:46ch; margin:0 auto 34px; }
[data-profile-theme="noir"] .nf-cta__btns{ display:flex; gap:14px; justify-content:center; flex-wrap:wrap; align-items:center; }

/* footer */
[data-profile-theme="noir"] .nf-foot{ background:#100e13; border-top:1px solid var(--nf-line); padding-block:clamp(40px,6vw,72px); }
[data-profile-theme="noir"] .nf-foot__row{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:18px; }
[data-profile-theme="noir"] .nf-foot__brand{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:clamp(1.8rem,4vw,2.8rem); letter-spacing:0.12em; color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-foot__pw{ font-size:10.5px; letter-spacing:0.16em; text-transform:uppercase; color:rgba(236,228,211,0.5); }
[data-profile-theme="noir"] .nf-foot__pw em{ font-style:normal; color:var(--nf-champagne); }

/* sticky book bar */
[data-profile-theme="noir"] .nf-bookbar{ position:sticky; bottom:0; z-index:40; background:rgba(10,9,12,0.92); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px var(--nf-pad); flex-wrap:wrap; border-top:1px solid var(--nf-line); }
[data-profile-theme="noir"] .nf-bookbar .who{ display:flex; align-items:center; gap:14px; min-width:0; }
[data-profile-theme="noir"] .nf-bookbar .who img{ width:46px; height:46px; border-radius:50%; object-fit:cover; border:1px solid var(--nf-gold); }
[data-profile-theme="noir"] .nf-bookbar .who .mono{ width:46px; height:46px; border-radius:50%; border:1px solid var(--nf-gold); display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; color:var(--nf-champagne); }
[data-profile-theme="noir"] .nf-bookbar .who .n{ font-family:'Cormorant Garamond',serif; font-size:1.3rem; line-height:1; }
[data-profile-theme="noir"] .nf-bookbar .who .s{ font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:var(--nf-champagne); margin-top:3px; }

/* the passed-in inquire/share/save slots inherit gold via the --plt overrides */
[data-profile-theme="noir"] .nf-preview-banner{ border-bottom:1px solid var(--nf-line); background:#100e13; color:rgba(236,228,211,0.7); text-align:center; padding:12px 16px; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; }

/* Reused sub-blocks render their own heading; Noir supplies its grand
   nf-sec-head instead, so suppress the block heading (we pass heading="").
   display:none removes the empty element from the a11y tree + closes the gap. */
[data-profile-theme="noir"] #skills-exp-heading,
[data-profile-theme="noir"] #services-heading,
[data-profile-theme="noir"] #service-menu-heading,
[data-profile-theme="noir"] #featured-media-heading{ display:none !important; }
[data-profile-theme="noir"] section[aria-label="Client reviews"] > div:first-of-type{ display:none !important; }

/* reveal-on-scroll (driven by NoirReveal; hero is never marked so it paints instantly) */
[data-profile-theme="noir"] [data-nf-reveal]{ opacity:0; transform:translateY(26px); transition:opacity .9s var(--nf-ease), transform .9s var(--nf-ease); will-change:opacity,transform; }
[data-profile-theme="noir"] [data-nf-reveal].nf-in{ opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce){
  [data-profile-theme="noir"] [data-nf-reveal]{ opacity:1 !important; transform:none !important; transition:none !important; }
}

@media (max-width:900px){
  [data-profile-theme="noir"] .nf-hero{ grid-template-columns:1fr; }
  [data-profile-theme="noir"] .nf-similar{ grid-template-columns:repeat(2,1fr); }
  [data-profile-theme="noir"] .nf-sec-head{ flex-direction:column; align-items:flex-start; }
}
`;

export function NoirProfileLayout(props: LightProfileLayoutProps) {
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

  const isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic";
  const heroImg = profileImageUrl ?? bannerUrl;
  const agency = agencyDisplayName ?? agencyName;

  // Hero chips ------------------------------------------------------------
  const langShort = languages
    .map((l) => l.split(" (")[0].trim())
    .filter(Boolean)
    .slice(0, 4);
  const travels = serviceAreas.some((s) => s.service_kind === "travel_to");
  const eyebrowLine =
    allTalentTypes.length > 0 ? allTalentTypes.join(" · ") : primaryType;

  // Digitals / detail groups ---------------------------------------------
  const groupedBasic =
    basicInfoDetailRows.length > 0
      ? [{ group: detailsLabels.measurements, rows: basicInfoDetailRows }]
      : [];
  const detailGroups = [...groupedBasic, ...groupDetailRows(otherDetailRows)];

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
  const hasServiceMenu = !isFreePlan && serviceMenuItems.length > 0;
  const showClients = fieldVisibility.showIndustries && industries.length > 0;

  const labels = {
    digitalsEyebrow: pickLocale(locale, { en: "Digitals", es: "Medidas" }),
    portfolioEyebrow: pickLocale(locale, { en: "Portfolio", es: "Portafolio" }),
    portfolioTitle: pickLocale(locale, { en: "Selected work.", es: "Trabajo selecto." }),
    viewPortfolio: pickLocale(locale, { en: "View portfolio", es: "Ver portafolio" }),
    represented: pickLocale(locale, { en: "Represented", es: "Representada" }),
    travels: pickLocale(locale, { en: "Travels worldwide", es: "Viaja a todo el mundo" }),
    featured: ui.card.featuredLabel,
    skillsEyebrow: pickLocale(locale, { en: "Craft", es: "Oficio" }),
    skillsTitle: pickLocale(locale, { en: "Skills & specialties.", es: "Habilidades y especialidades." }),
    servicesEyebrow: pickLocale(locale, { en: "Bookings", es: "Reservas" }),
    servicesTitle: pickLocale(locale, { en: "Services & rates.", es: "Servicios y tarifas." }),
    watchEyebrow: pickLocale(locale, { en: "Featured", es: "Destacado" }),
    watchTitle: pickLocale(locale, { en: "Watch & listen.", es: "Mira y escucha." }),
    clientsEyebrow: pickLocale(locale, { en: "Select clients", es: "Clientes selectos" }),
    reviewsEyebrow: pickLocale(locale, { en: "Word of mouth", es: "Reseñas" }),
    reviewsTitle: pickLocale(locale, { en: "What clients say.", es: "Lo que dicen los clientes." }),
    rosterEyebrow: pickLocale(locale, { en: "The board", es: "El board" }),
    rosterTitle: pickLocale(locale, { en: "More from this roster.", es: "Más de este roster." }),
    visitSite: pickLocale(locale, { en: "Visit my site", es: "Visita mi sitio" }),
  };

  const detailValue = (rows: DetailRow[]) =>
    rows.map((r) => (
      <div className="d" key={r.key}>
        <div className="k">{r.label}</div>
        <div className="v">{r.value}</div>
      </div>
    ));

  return (
    <main
      id="main-content"
      className="flex-1"
      style={noirVars as React.CSSProperties}
      data-profile-shell
      data-profile-theme="noir"
    >
      {/* Fonts + scoped Noir styles */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Page-scoped on purpose — Cormorant/Jost are loaded only on Noir
          profiles, not globally. fonts.googleapis.com is already CSP-allowed
          (see app/google-fonts-link.tsx + builder render.tsx). */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Jost:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: NOIR_CSS }} />
      {/* No-JS / pre-hydration safety: reveal everything if the controller never runs. */}
      <noscript>
        <style>{`[data-profile-theme="noir"] [data-nf-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <NoirReveal />

      {resolvedPreview ? (
        <div className="nf-preview-banner">{t("public.profile.previewModeBanner")}</div>
      ) : null}

      {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
      <section className="nf-wrap nf-hero" data-profile-section="hero">
        <div className="nf-portrait">
          {heroImg ? (
            <Image
              src={heroImg}
              alt={`${name}, portrait`}
              fill
              priority
              sizes="(min-width: 900px) 50vw, 100vw"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div className="nf-portrait__mono" aria-hidden="true">
              <Silhouette />
            </div>
          )}
        </div>

        <div className="nf-intro">
          {eyebrowLine ? <span className="nf-eyebrow">{eyebrowLine}</span> : null}
          <h1>{name}</h1>

          <div className="nf-chips">
            {livesIn ? <span className="nf-chip">{livesIn}</span> : null}
            {agency ? <span className="nf-chip nf-chip--gold">{labels.represented}</span> : null}
            {langShort.length > 0 ? (
              <span className="nf-chip">{langShort.join(" · ")}</span>
            ) : null}
            {travels ? <span className="nf-chip">{labels.travels}</span> : null}
            {isFeatured ? (
              <span className="nf-chip nf-chip--gold">{labels.featured}</span>
            ) : null}
          </div>

          {aboutText.trim() ? <p className="nf-bio">{aboutText}</p> : null}

          <div className="nf-actions">
            {inquireButtonHeader}
            {galleryItems.length > 0 ? (
              <a href="#nf-portfolio" className="nf-btn nf-btn--ghost">
                {labels.viewPortfolio}
              </a>
            ) : null}
            {maxSiteUrl ? (
              <a
                href={maxSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="nf-btn nf-btn--ghost"
              >
                {labels.visitSite} <span className="arr">→</span>
              </a>
            ) : null}
          </div>

          <div className="nf-hero-extra">
            {shareMenuHeader}
            {discoveryCta}
            {hubsIndicator}
          </div>

          {availableDaysInNext30 != null || nextAvailableDate ? (
            <div style={{ marginTop: 26, maxWidth: 360 }}>
              <AvailabilityWidget
                availableDaysInNext30={availableDaysInNext30}
                availabilityDots14d={availabilityDots14d}
                nextAvailableDate={nextAvailableDate}
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* ── 2. DIGITALS ─────────────────────────────────────────────────── */}
      {detailGroups.length > 0 ? (
        <section className="nf-wrap nf-section" data-profile-section="details" data-nf-reveal>
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.digitalsEyebrow}</span>
              <h2>{detailsLabels.measurements}</h2>
            </div>
          </div>
          {detailGroups.map((g, i) => (
            <div key={g.group}>
              {i > 0 ? <div className="nf-group-label">{g.group}</div> : null}
              <div className="nf-digitals">{detailValue(g.rows)}</div>
            </div>
          ))}
        </section>
      ) : null}

      {/* ── 3. SKILLS & SPECIALTIES ─────────────────────────────────────── */}
      {hasSkills ? (
        <section className="nf-wrap nf-section" data-profile-section="skills" data-nf-reveal>
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.skillsEyebrow}</span>
              <h2>{labels.skillsTitle}</h2>
            </div>
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

      {/* ── 4. SERVICES + pricing ───────────────────────────────────────── */}
      {hasServices || hasServiceMenu ? (
        <section className="nf-wrap nf-section" data-profile-section="services" data-nf-reveal>
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.servicesEyebrow}</span>
              <h2>{labels.servicesTitle}</h2>
            </div>
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
              <ServiceMenuBlock
                items={serviceMenuItems}
                locale={locale}
                heading={pickLocale(locale, { en: "Services & pricing", es: "Servicios y precios" })}
                disciplineLabels={disciplineLabels}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── 5. PORTFOLIO ────────────────────────────────────────────────── */}
      {galleryItems.length > 0 ? (
        <section id="nf-portfolio" className="nf-wrap nf-section" data-profile-section="portfolio" data-nf-reveal>
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.portfolioEyebrow}</span>
              <h2>{labels.portfolioTitle}</h2>
            </div>
            {galleryItems.length > 9 ? (
              <span className="nf-sec-head__aside">{galleryItems.length} works</span>
            ) : null}
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

      {/* ── 6. WATCH / LISTEN ───────────────────────────────────────────── */}
      {featuredMediaItems.length > 0 ? (
        <section className="nf-wrap nf-section" data-profile-section="featured-media" data-nf-reveal>
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.watchEyebrow}</span>
              <h2>{labels.watchTitle}</h2>
            </div>
          </div>
          <PublicFeaturedMedia items={featuredMediaItems} heading="" />
        </section>
      ) : null}

      {/* ── 7. CLIENTS band ─────────────────────────────────────────────── */}
      {showClients ? (
        <section data-nf-reveal className="nf-section" style={{ background: "#100e13", borderTop: "1px solid var(--nf-line)", borderBottom: "1px solid var(--nf-line)" }}>
          <div className="nf-wrap">
            <span className="nf-eyebrow">{labels.clientsEyebrow}</span>
            <div className="nf-clients" style={{ marginTop: 28 }}>
              {industries.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 8. REVIEWS ──────────────────────────────────────────────────── */}
      {ratingSummary.count > 0 ? (
        <section className="nf-wrap nf-section" data-profile-section="reviews" data-nf-reveal>
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.reviewsEyebrow}</span>
              <h2>{labels.reviewsTitle}</h2>
            </div>
          </div>
          <TalentReviewsSection
            summary={ratingSummary}
            reviews={talentReviews}
            theme="dark"
            heading=""
          />
        </section>
      ) : null}

      {/* ── 9. MORE FROM THIS ROSTER ────────────────────────────────────── */}
      {similarTalent.length > 0 ? (
        <section className="nf-wrap nf-section" data-nf-reveal aria-label="More talent from this roster">
          <div className="nf-sec-head">
            <div>
              <span className="nf-eyebrow">{labels.rosterEyebrow}</span>
              <h2>{labels.rosterTitle}</h2>
            </div>
          </div>
          <div className="nf-similar">
            {similarTalent.map((st) => (
              <div key={st.id} className="nf-similar__card">
                <Link href={st.href} className="nf-similar__media">
                  {st.thumbnailUrl ? (
                    <Image
                      src={st.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(min-width: 900px) 25vw, 50vw"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div className="nf-portrait__mono" aria-hidden="true">
                      <Silhouette />
                    </div>
                  )}
                  <div className="nf-similar__cap">
                    <div className="nm">{st.displayName}</div>
                    {st.primaryType ? <div className="ct">{st.primaryType}</div> : null}
                  </div>
                </Link>
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

      {/* ── 10. CTA ─────────────────────────────────────────────────────── */}
      <section className="nf-cta" data-nf-reveal aria-label={t("public.profile.ctaSectionAria")}>
        <div className="nf-wrap nf-cta__inner">
          <span className="nf-eyebrow" style={{ justifyContent: "center" }}>
            {ui.common.brand}
          </span>
          <h2>{t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}</h2>
          <p>{t("public.profile.footerCtaBody")}</p>
          <div className="nf-cta__btns">
            {inquireButtonFooter}
            {discoveryCta3}
          </div>
        </div>
      </section>

      {/* ── 11. FOOTER (agency host only) ───────────────────────────────── */}
      {showFooter ? (
        <footer className="nf-foot">
          <div className="nf-wrap">
            <div className="nf-foot__row">
              <div
                className="text-center sm:text-left"
                style={{ color: "rgba(236,228,211,0.6)", fontSize: 13 }}
              >
                <PublicCmsFooterNav locale={locale} />
              </div>
              <span className="nf-foot__pw">
                Powered by <em>Tulala</em>
              </span>
            </div>
          </div>
        </footer>
      ) : null}

      {/* ── 12. STICKY BOOK BAR ─────────────────────────────────────────── */}
      <div className="nf-bookbar" data-profile-sticky-bar="visible">
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
                ? pickLocale(locale, { en: `Represented by ${agency}`, es: `Representada por ${agency}` })
                : primaryType ?? ""}
            </div>
          </div>
        </div>
        {inquireButtonFooter}
      </div>
    </main>
  );
}
