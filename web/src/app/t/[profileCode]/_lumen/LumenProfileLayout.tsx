/**
 * LumenProfileLayout — "Lumen" modern, airy, premium talent profile template.
 *
 * A drop-in alternative to LightProfileLayout / NoirProfileLayout: it accepts the
 * EXACT same props (LightProfileLayoutProps) so page.tsx can swap between them
 * with a single dispatch variable. Every live interactive slot (inquire /
 * instant-book, share, save/discovery, reviews, services pricing, lightbox,
 * similar talent) is preserved.
 *
 * Visual language — high-end SaaS / agency portfolio:
 *   - Generous whitespace, large modern-sans type, refined hairlines.
 *   - Accent-colored eyebrows + CTAs (tenant accent via --pp-accent).
 *   - Adaptive hero (cover-led / split / text-only) — never an empty image box.
 *   - Two-column body on large screens: main column + sticky right rail.
 *
 * Theme-adaptive: buildAdaptiveThemeStyle() projects the tenant's light/dark
 * register + color tokens onto a semantic --pp-* palette AND overrides the
 * global --plt-* tokens so the reused sub-blocks (ServicesBlock,
 * ServiceMenuBlock, SkillsExperienceBlock, AvailabilityWidget, reviews, the
 * portfolio lightbox, the passed-in inquire buttons) adopt the same register
 * automatically. The template's OWN CSS consumes var(--pp-*) ONLY.
 *
 * Server component — pure presentational, no hooks or client-side state.
 *
 * Sections (top → bottom):
 *   1. HERO — adaptive (cover-led / split portrait / text-only)
 *   2. BODY (two columns on lg+):
 *        MAIN: About → Portfolio → spec cards → Skills → Services →
 *              Integrations/Featured media → Reviews
 *        RAIL (sticky): availability → booking card → quick facts
 *   3. MORE FROM THIS ROSTER — similar talent
 *   4. CTA — "Request availability"
 *   5. FOOTER (agency host only)
 *   6. STICKY BAR (mobile/tablet)
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
import { TestimonialsSection } from "@/components/reviews/TestimonialsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { buildAdaptiveThemeStyle } from "../_shared/profile-theme";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Scoped Lumen styles. Every selector is namespaced under [data-profile-theme="lumen"].
// Colors consume the semantic --pp-* palette ONLY (set by buildAdaptiveThemeStyle),
// so the template tracks the tenant's light/dark register + accent.
const LUMEN_CSS = `
[data-profile-theme="lumen"]{
  --lm-ease:cubic-bezier(0.16,1,0.3,1);
  --lm-pad:clamp(20px,5vw,72px);
  --lm-maxw:1280px;
  background:var(--pp-bg); color:var(--pp-ink);
  font-family:var(--plt-font-display,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif);
  font-weight:400; line-height:1.6; -webkit-font-smoothing:antialiased;
}
[data-profile-theme="lumen"] ::selection{ background:var(--pp-accent); color:var(--pp-accent-on); }
[data-profile-theme="lumen"] .lm-display{ font-family:var(--plt-font-display,-apple-system,system-ui,sans-serif); font-weight:600; letter-spacing:-0.02em; line-height:1.05; color:var(--pp-ink); }
[data-profile-theme="lumen"] .lm-wrap{ width:100%; max-width:var(--lm-maxw); margin-inline:auto; padding-inline:var(--lm-pad); }
[data-profile-theme="lumen"] .lm-section{ padding-block:clamp(36px,5vw,64px); }
[data-profile-theme="lumen"] .lm-eyebrow{ font-size:11px; letter-spacing:0.22em; text-transform:uppercase; font-weight:600; color:var(--pp-accent); display:inline-flex; align-items:center; gap:10px; }
[data-profile-theme="lumen"] .lm-sec-head{ margin-bottom:clamp(20px,3vw,32px); }
[data-profile-theme="lumen"] .lm-sec-head h2{ font-family:var(--plt-font-display,-apple-system,system-ui,sans-serif); font-weight:600; letter-spacing:-0.02em; font-size:clamp(1.5rem,2.6vw,2.1rem); margin-top:12px; color:var(--pp-ink); }

/* buttons */
[data-profile-theme="lumen"] .lm-btn{ display:inline-flex; align-items:center; gap:8px; font-size:13px; letter-spacing:0.01em; font-weight:600; padding:12px 24px; border-radius:999px; transition:all .3s var(--lm-ease); border:1px solid var(--pp-line-strong); color:var(--pp-ink); white-space:nowrap; cursor:pointer; background:transparent; }
[data-profile-theme="lumen"] .lm-btn:hover{ border-color:var(--pp-accent); color:var(--pp-accent); }
[data-profile-theme="lumen"] .lm-btn .arr{ transition:transform .3s var(--lm-ease); }
[data-profile-theme="lumen"] .lm-btn:hover .arr{ transform:translateX(4px); }

/* hero — text-only / split */
[data-profile-theme="lumen"] .lm-hero{ padding-top:clamp(40px,7vh,88px); padding-bottom:clamp(28px,4vw,48px); }
[data-profile-theme="lumen"] .lm-hero--text{ background:var(--pp-surface); border-bottom:1px solid var(--pp-line); border-radius:0; }
[data-profile-theme="lumen"] .lm-hero--text .lm-hero__inner{ max-width:62ch; }
[data-profile-theme="lumen"] .lm-hero--split{ display:grid; grid-template-columns:0.85fr 1fr; gap:clamp(28px,5vw,64px); align-items:center; }
[data-profile-theme="lumen"] .lm-hero h1{ font-family:var(--plt-font-display,-apple-system,system-ui,sans-serif); font-weight:600; letter-spacing:-0.03em; font-size:clamp(2.4rem,5.6vw,4.4rem); line-height:1.02; margin-top:14px; color:var(--pp-ink); }
[data-profile-theme="lumen"] .lm-portrait{ position:relative; aspect-ratio:4/5; overflow:hidden; background:var(--pp-surface); border-radius:18px; border:1px solid var(--pp-line); }
[data-profile-theme="lumen"] .lm-portrait img{ width:100%; height:100%; object-fit:cover; }
[data-profile-theme="lumen"] .lm-portrait__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--plt-font-display,system-ui,sans-serif); font-weight:600; font-size:clamp(3.5rem,9vw,7rem); color:var(--pp-accent); letter-spacing:0.04em; }

/* hero — cover-led */
[data-profile-theme="lumen"] .lm-cover{ position:relative; min-height:clamp(420px,62vh,640px); display:flex; align-items:flex-end; overflow:hidden; }
[data-profile-theme="lumen"] .lm-cover__img{ position:absolute; inset:0; }
[data-profile-theme="lumen"] .lm-cover__img img{ width:100%; height:100%; object-fit:cover; }
[data-profile-theme="lumen"] .lm-cover__scrim{ position:absolute; inset:0; background:linear-gradient(180deg, transparent 30%, var(--pp-scrim) 78%, var(--pp-scrim)); }
[data-profile-theme="lumen"] .lm-cover__body{ position:relative; z-index:2; width:100%; padding-block:clamp(34px,5vw,60px); display:flex; align-items:flex-end; justify-content:space-between; gap:32px; flex-wrap:wrap; }
[data-profile-theme="lumen"] .lm-cover__txt h1{ color:#fff; }
[data-profile-theme="lumen"] .lm-cover__txt .lm-eyebrow{ color:#fff; }
[data-profile-theme="lumen"] .lm-cover__txt .lm-bio{ color:rgba(255,255,255,0.86); }
[data-profile-theme="lumen"] .lm-cover__txt .lm-chip{ color:#fff; border-color:rgba(255,255,255,0.5); }
[data-profile-theme="lumen"] .lm-cover__inset{ position:relative; width:clamp(120px,16vw,184px); aspect-ratio:4/5; overflow:hidden; border-radius:14px; border:3px solid rgba(255,255,255,0.85); flex-shrink:0; box-shadow:0 18px 40px -22px rgba(0,0,0,0.6); }
[data-profile-theme="lumen"] .lm-cover__inset img{ width:100%; height:100%; object-fit:cover; }

[data-profile-theme="lumen"] .lm-chips{ display:flex; gap:9px; flex-wrap:wrap; margin-top:20px; }
[data-profile-theme="lumen"] .lm-chip{ font-size:11px; letter-spacing:0.04em; font-weight:500; padding:6px 14px; border:1px solid var(--pp-line-strong); border-radius:999px; color:var(--pp-ink-soft); }
[data-profile-theme="lumen"] .lm-chip--accent{ border-color:var(--pp-accent); color:var(--pp-accent); }
[data-profile-theme="lumen"] .lm-bio{ color:var(--pp-ink-soft); margin-top:20px; max-width:54ch; font-size:1.05rem; line-height:1.75; }
[data-profile-theme="lumen"] .lm-actions{ display:flex; gap:12px; margin-top:28px; flex-wrap:wrap; align-items:center; }
[data-profile-theme="lumen"] .lm-hero-extra{ margin-top:22px; display:flex; gap:16px; flex-wrap:wrap; align-items:center; }

/* body grid */
[data-profile-theme="lumen"] .lm-body{ display:grid; grid-template-columns:1fr; gap:clamp(28px,4vw,56px); padding-block:clamp(32px,5vw,64px); }
[data-profile-theme="lumen"] .lm-main{ display:flex; flex-direction:column; gap:clamp(40px,6vw,72px); min-width:0; }
[data-profile-theme="lumen"] .lm-prose{ color:var(--pp-ink-soft); font-size:1.0625rem; line-height:1.85; max-width:62ch; }

/* spec cards */
[data-profile-theme="lumen"] .lm-specs{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
[data-profile-theme="lumen"] .lm-spec{ background:var(--pp-surface); border:1px solid var(--pp-line); border-radius:16px; padding:22px 24px; min-width:0; }
[data-profile-theme="lumen"] .lm-spec__eyebrow{ font-size:10px; letter-spacing:0.18em; text-transform:uppercase; font-weight:600; color:var(--pp-accent); }
[data-profile-theme="lumen"] .lm-spec__grid{ margin-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:14px 20px; }
[data-profile-theme="lumen"] .lm-spec__grid .row{ min-width:0; }
[data-profile-theme="lumen"] .lm-spec__grid .k{ font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:var(--pp-muted); }
[data-profile-theme="lumen"] .lm-spec__grid .v{ font-size:0.95rem; font-weight:500; color:var(--pp-ink); margin-top:3px; word-break:break-word; }

/* rail */
[data-profile-theme="lumen"] .lm-rail{ display:flex; flex-direction:column; gap:18px; }
[data-profile-theme="lumen"] .lm-card{ background:var(--pp-surface); border:1px solid var(--pp-line); border-radius:18px; padding:22px; }
[data-profile-theme="lumen"] .lm-card__title{ font-size:11px; letter-spacing:0.16em; text-transform:uppercase; font-weight:600; color:var(--pp-accent); margin-bottom:14px; }
[data-profile-theme="lumen"] .lm-card__agency{ font-size:0.95rem; color:var(--pp-ink-soft); margin-bottom:16px; }
[data-profile-theme="lumen"] .lm-card__agency strong{ color:var(--pp-ink); font-weight:600; }
[data-profile-theme="lumen"] .lm-book__actions{ display:flex; flex-direction:column; gap:12px; }
[data-profile-theme="lumen"] .lm-book__row{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:14px; }
[data-profile-theme="lumen"] .lm-facts dl{ display:flex; flex-direction:column; gap:12px; }
[data-profile-theme="lumen"] .lm-facts .row{ display:flex; justify-content:space-between; gap:16px; align-items:baseline; border-bottom:1px solid var(--pp-line); padding-bottom:10px; }
[data-profile-theme="lumen"] .lm-facts .row:last-child{ border-bottom:0; padding-bottom:0; }
[data-profile-theme="lumen"] .lm-facts .k{ font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--pp-muted); flex-shrink:0; }
[data-profile-theme="lumen"] .lm-facts .v{ font-size:0.9rem; font-weight:500; color:var(--pp-ink); text-align:right; word-break:break-word; }

/* similar */
[data-profile-theme="lumen"] .lm-similar{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
[data-profile-theme="lumen"] .lm-similar__card{ position:relative; }
[data-profile-theme="lumen"] .lm-similar__media{ position:relative; aspect-ratio:3/4; overflow:hidden; background:var(--pp-surface); border:1px solid var(--pp-line); border-radius:16px; display:block; }
[data-profile-theme="lumen"] .lm-similar__media img{ width:100%; height:100%; object-fit:cover; transition:transform .6s var(--lm-ease); }
[data-profile-theme="lumen"] .lm-similar__card:hover .lm-similar__media img{ transform:scale(1.04); }
[data-profile-theme="lumen"] .lm-similar__cap{ position:absolute; left:0; right:0; bottom:0; padding:14px; background:linear-gradient(transparent, rgba(0,0,0,0.7)); border-radius:0 0 16px 16px; }
[data-profile-theme="lumen"] .lm-similar__cap .nm{ font-weight:600; font-size:0.95rem; color:#fff; }
[data-profile-theme="lumen"] .lm-similar__cap .ct{ font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.78); margin-top:3px; }
[data-profile-theme="lumen"] .lm-similar__mono{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--plt-font-display,system-ui,sans-serif); font-weight:600; font-size:2.4rem; color:var(--pp-muted); }

/* cta */
[data-profile-theme="lumen"] .lm-cta{ border-top:1px solid var(--pp-line); background:var(--pp-surface); }
[data-profile-theme="lumen"] .lm-cta__inner{ text-align:center; padding-block:clamp(56px,9vw,120px); display:flex; flex-direction:column; align-items:center; gap:18px; }
[data-profile-theme="lumen"] .lm-cta h2{ font-family:var(--plt-font-display,system-ui,sans-serif); font-weight:600; letter-spacing:-0.03em; font-size:clamp(1.9rem,4.4vw,3.4rem); line-height:1.05; max-width:18ch; color:var(--pp-ink); }
[data-profile-theme="lumen"] .lm-cta p{ color:var(--pp-ink-soft); max-width:48ch; font-size:1.05rem; }
[data-profile-theme="lumen"] .lm-cta__btns{ display:flex; gap:14px; justify-content:center; flex-wrap:wrap; align-items:center; margin-top:8px; }

/* footer */
[data-profile-theme="lumen"] .lm-foot{ border-top:1px solid var(--pp-line); background:var(--pp-bg); padding-block:clamp(32px,5vw,56px); }
[data-profile-theme="lumen"] .lm-foot__row{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
[data-profile-theme="lumen"] .lm-foot__pw{ font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--pp-muted); }
[data-profile-theme="lumen"] .lm-foot__pw em{ font-style:normal; color:var(--pp-accent); font-weight:600; }

/* sticky bar (mobile/tablet) */
[data-profile-theme="lumen"] .lm-bookbar{ position:fixed; inset-inline:0; bottom:0; z-index:50; padding:0 12px 12px; }
[data-profile-theme="lumen"] .lm-bookbar__inner{ max-width:640px; margin-inline:auto; display:flex; align-items:center; gap:14px; padding:10px 10px 10px 20px; border-radius:999px; background:var(--pp-elevated); border:1px solid var(--pp-line-strong); box-shadow:var(--plt-shadow-lg); }
[data-profile-theme="lumen"] .lm-bookbar__who{ display:flex; min-width:0; flex:1; align-items:baseline; gap:10px; }
[data-profile-theme="lumen"] .lm-bookbar__n{ font-weight:600; font-size:0.95rem; color:var(--pp-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-profile-theme="lumen"] .lm-bookbar__s{ font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:var(--pp-muted); white-space:nowrap; }

/* preview banner */
[data-profile-theme="lumen"] .lm-preview-banner{ border-bottom:1px solid var(--pp-line); background:var(--pp-surface); color:var(--pp-muted); text-align:center; padding:11px 16px; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; }

/* Suppress reused sub-blocks' own headings; Lumen supplies its own section
   header above each (we pass heading="" / headingLabel=""). */
[data-profile-theme="lumen"] #skills-exp-heading,
[data-profile-theme="lumen"] #services-heading,
[data-profile-theme="lumen"] #service-menu-heading,
[data-profile-theme="lumen"] #featured-media-heading{ display:none !important; }
[data-profile-theme="lumen"] section[aria-label="Client reviews"] > div:first-of-type{ display:none !important; }

@media (max-width:1023px){
  [data-profile-theme="lumen"] .lm-similar{ grid-template-columns:repeat(2,1fr); }
}
@media (max-width:767px){
  [data-profile-theme="lumen"] .lm-hero--split{ grid-template-columns:1fr; }
  [data-profile-theme="lumen"] .lm-spec__grid{ grid-template-columns:1fr; }
}
@media (min-width:1024px){
  [data-profile-theme="lumen"] .lm-body{ grid-template-columns:minmax(0,1fr) 340px; align-items:start; }
  [data-profile-theme="lumen"] .lm-rail{ position:sticky; top:24px; }
}
`;

export function LumenProfileLayout(props: LightProfileLayoutProps) {
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
    testimonials = [],
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
    inquireButtonSidebar,
    inquireButtonFooter,
    shareMenuHeader,
    shareMenuSidebar,
    discoveryCta,
    discoveryCta2,
    discoveryCta3,
    hubsIndicator,
  } = props;

  const themeMode = props.themeMode ?? "light";
  const themeKey = "lumen";
  const isDark = themeMode === "dark";
  const themeStyle = buildAdaptiveThemeStyle(themeMode, props.themeVars);

  const isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic";
  const agency = agencyDisplayName ?? agencyName;

  // Hero variant selection (adaptive) -------------------------------------
  const hasCover = Boolean(bannerUrl);
  const hasPortrait = Boolean(profileImageUrl);
  const heroVariant: "cover" | "split" | "text" = hasCover
    ? "cover"
    : hasPortrait
      ? "split"
      : "text";

  // Hero chips ------------------------------------------------------------
  const langShort = languages
    .map((l) => l.split(" (")[0].trim())
    .filter(Boolean)
    .slice(0, 4);
  const travels = serviceAreas.some((s) => s.service_kind === "travel_to");
  const eyebrowLine =
    allTalentTypes.length > 0 ? allTalentTypes.join(" · ") : primaryType;

  // Detail groups (spec cards) — surface every field group -----------------
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

  const hasAvailability =
    availableDaysInNext30 != null ||
    availabilityDots14d != null ||
    nextAvailableDate != null;

  // Quick facts — a few key spec rows for the rail.
  const quickFacts: Array<{ key: string; label: string; value: string }> = [];
  if (livesIn) quickFacts.push({ key: "based", label: pickLocale(locale, { en: "Based in", es: "Ubicación" }), value: livesIn });
  if (primaryType) quickFacts.push({ key: "discipline", label: pickLocale(locale, { en: "Discipline", es: "Disciplina" }), value: primaryType });
  if (langShort.length > 0) quickFacts.push({ key: "languages", label: pickLocale(locale, { en: "Languages", es: "Idiomas" }), value: langShort.join(", ") });
  if (travels) quickFacts.push({ key: "travel", label: pickLocale(locale, { en: "Travel", es: "Viajes" }), value: pickLocale(locale, { en: "Worldwide", es: "A todo el mundo" }) });
  if (startingFrom?.trim()) quickFacts.push({ key: "from", label: pickLocale(locale, { en: "From", es: "Desde" }), value: startingFrom });

  const labels = {
    aboutEyebrow: pickLocale(locale, { en: "Profile", es: "Perfil" }),
    aboutTitle: pickLocale(locale, { en: "About", es: "Sobre" }),
    portfolioEyebrow: pickLocale(locale, { en: "Portfolio", es: "Portafolio" }),
    portfolioTitle: pickLocale(locale, { en: "Selected work", es: "Trabajo selecto" }),
    viewPortfolio: pickLocale(locale, { en: "View portfolio", es: "Ver portafolio" }),
    detailsEyebrow: pickLocale(locale, { en: "Details", es: "Detalles" }),
    detailsTitle: detailsLabels.details,
    skillsEyebrow: pickLocale(locale, { en: "Craft", es: "Oficio" }),
    skillsTitle: pickLocale(locale, { en: "Skills & specialties", es: "Habilidades y especialidades" }),
    servicesEyebrow: pickLocale(locale, { en: "Bookings", es: "Reservas" }),
    servicesTitle: pickLocale(locale, { en: "Services & rates", es: "Servicios y tarifas" }),
    mediaEyebrow: pickLocale(locale, { en: "Featured", es: "Destacado" }),
    mediaTitle: pickLocale(locale, { en: "Watch & listen", es: "Mira y escucha" }),
    reviewsEyebrow: pickLocale(locale, { en: "Word of mouth", es: "Reseñas" }),
    reviewsTitle: pickLocale(locale, { en: "What clients say", es: "Lo que dicen los clientes" }),
    rosterEyebrow: pickLocale(locale, { en: "The roster", es: "El roster" }),
    rosterTitle: pickLocale(locale, { en: "More from this roster", es: "Más de este roster" }),
    represented: pickLocale(locale, { en: "Represented", es: "Representada" }),
    travels: pickLocale(locale, { en: "Travels worldwide", es: "Viaja a todo el mundo" }),
    featured: ui.card.featuredLabel,
    visitSite: pickLocale(locale, { en: "Visit my site", es: "Visita mi sitio" }),
    availability: pickLocale(locale, { en: "Availability", es: "Disponibilidad" }),
    booking: pickLocale(locale, { en: "Book this talent", es: "Reservar talento" }),
    quickFacts: pickLocale(locale, { en: "Quick facts", es: "Datos rápidos" }),
    representedBy: pickLocale(locale, { en: "Represented by", es: "Representada por" }),
  };

  // Reusable hero chips ---------------------------------------------------
  const heroChips = (
    <div className="lm-chips">
      {livesIn ? <span className="lm-chip">{livesIn}</span> : null}
      {agency ? <span className="lm-chip lm-chip--accent">{labels.represented}</span> : null}
      {langShort.length > 0 ? <span className="lm-chip">{langShort.join(" · ")}</span> : null}
      {travels ? <span className="lm-chip">{labels.travels}</span> : null}
      {isFeatured ? <span className="lm-chip lm-chip--accent">{labels.featured}</span> : null}
    </div>
  );

  const heroActions = (
    <>
      <div className="lm-actions">
        {inquireButtonHeader}
        {galleryItems.length > 0 ? (
          <a href="#lm-portfolio" className="lm-btn">
            {labels.viewPortfolio}
          </a>
        ) : null}
        {maxSiteUrl ? (
          <a href={maxSiteUrl} target="_blank" rel="noopener noreferrer" className="lm-btn">
            {labels.visitSite} <span className="arr">→</span>
          </a>
        ) : null}
      </div>
      <div className="lm-hero-extra">
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
      data-profile-theme={themeKey}
    >
      <style dangerouslySetInnerHTML={{ __html: LUMEN_CSS }} />

      {resolvedPreview ? (
        <div className="lm-preview-banner">{t("public.profile.previewModeBanner")}</div>
      ) : null}

      {/* ── 1. HERO (adaptive) ──────────────────────────────────────────── */}
      {heroVariant === "cover" ? (
        <section className="lm-cover" data-profile-section="hero">
          <div className="lm-cover__img">
            <Image
              src={bannerUrl as string}
              alt={`${name}, cover`}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className="lm-cover__scrim" aria-hidden="true" />
          <div className="lm-wrap lm-cover__body">
            <div className="lm-cover__txt" style={{ minWidth: 0 }}>
              {eyebrowLine ? <span className="lm-eyebrow">{eyebrowLine}</span> : null}
              <h1 className="lm-display">{name}</h1>
              {heroChips}
              {aboutText.trim() ? <p className="lm-bio">{aboutText}</p> : null}
              {heroActions}
            </div>
            {hasPortrait && profileImageUrl !== bannerUrl ? (
              <div className="lm-cover__inset">
                <Image
                  src={profileImageUrl as string}
                  alt={`${name}, portrait`}
                  fill
                  priority
                  sizes="184px"
                  style={{ objectFit: "cover" }}
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : heroVariant === "split" ? (
        <section className="lm-wrap lm-hero lm-hero--split" data-profile-section="hero">
          <div className="lm-portrait">
            <Image
              src={profileImageUrl as string}
              alt={`${name}, portrait`}
              fill
              priority
              sizes="(min-width: 768px) 40vw, 100vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            {eyebrowLine ? <span className="lm-eyebrow">{eyebrowLine}</span> : null}
            <h1 className="lm-display">{name}</h1>
            {heroChips}
            {aboutText.trim() ? <p className="lm-bio">{aboutText}</p> : null}
            {heroActions}
          </div>
        </section>
      ) : (
        <section className="lm-hero lm-hero--text" data-profile-section="hero">
          <div className="lm-wrap">
            <div className="lm-hero__inner">
              {eyebrowLine ? <span className="lm-eyebrow">{eyebrowLine}</span> : null}
              <h1 className="lm-display">{name}</h1>
              {heroChips}
              {aboutText.trim() ? <p className="lm-bio">{aboutText}</p> : null}
              {heroActions}
            </div>
          </div>
        </section>
      )}

      {/* ── 2. BODY (two columns on lg+) ────────────────────────────────── */}
      <div className="lm-wrap lm-body">
        {/* ── MAIN COLUMN ───────────────────────────────────────────────── */}
        <div className="lm-main">
          {/* About */}
          {aboutText.trim() ? (
            <section data-profile-section="about" aria-labelledby="lm-about-heading">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.aboutEyebrow}</span>
                <h2 id="lm-about-heading">{labels.aboutTitle}</h2>
              </div>
              <p className="lm-prose">{aboutText}</p>
            </section>
          ) : null}

          {/* Portfolio */}
          {galleryItems.length > 0 ? (
            <section id="lm-portfolio" data-profile-section="portfolio" aria-labelledby="lm-portfolio-heading">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.portfolioEyebrow}</span>
                <h2 id="lm-portfolio-heading">{labels.portfolioTitle}</h2>
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

          {/* Spec cards — all profile field groups */}
          {detailGroups.length > 0 ? (
            <section data-profile-section="details" aria-labelledby="lm-details-heading">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.detailsEyebrow}</span>
                <h2 id="lm-details-heading">{labels.detailsTitle}</h2>
              </div>
              <div className="lm-specs">
                {detailGroups.map((g) => (
                  <div className="lm-spec" key={g.group}>
                    <div className="lm-spec__eyebrow">{g.group}</div>
                    <dl className="lm-spec__grid">
                      {g.rows.map((r) => (
                        <div className="row" key={r.key}>
                          <dt className="k">{r.label}</dt>
                          <dd className="v">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Skills & specialties */}
          {hasSkills ? (
            <section data-profile-section="skills" aria-labelledby="lm-skills-heading">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.skillsEyebrow}</span>
                <h2 id="lm-skills-heading">{labels.skillsTitle}</h2>
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

          {/* Services + pricing (plan-gated) */}
          {hasServices || hasServiceMenu ? (
            <section data-profile-section="services" aria-labelledby="lm-services-heading">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.servicesEyebrow}</span>
                <h2 id="lm-services-heading">{labels.servicesTitle}</h2>
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

          {/* Integrations / featured media */}
          {featuredMediaItems.length > 0 ? (
            <section data-profile-section="featured-media" aria-labelledby="lm-media-heading">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.mediaEyebrow}</span>
                <h2 id="lm-media-heading">{labels.mediaTitle}</h2>
              </div>
              <PublicFeaturedMedia items={featuredMediaItems} heading="" />
            </section>
          ) : null}

          {/* Reviews */}
          {ratingSummary.count > 0 ? (
            <section data-profile-section="reviews" aria-label="Client reviews">
              <div className="lm-sec-head">
                <span className="lm-eyebrow">{labels.reviewsEyebrow}</span>
                <h2>{labels.reviewsTitle}</h2>
              </div>
              <TalentReviewsSection
                summary={ratingSummary}
                reviews={talentReviews}
                theme={isDark ? "dark" : "light"}
                heading=""
              />
            </section>
          ) : null}

          {/* Invited testimonials — separate from verified reviews. */}
          {testimonials.length > 0 ? (
            <section data-profile-section="testimonials" aria-label="Invited testimonials">
              <TestimonialsSection
                testimonials={testimonials}
                theme={isDark ? "dark" : "light"}
              />
            </section>
          ) : null}
        </div>

        {/* ── STICKY RIGHT RAIL ─────────────────────────────────────────── */}
        <aside className="lm-rail" aria-label={labels.booking}>
          {hasAvailability ? (
            <div className="lm-card lm-facts">
              <div className="lm-card__title">{labels.availability}</div>
              <AvailabilityWidget
                availableDaysInNext30={availableDaysInNext30}
                availabilityDots14d={availabilityDots14d}
                nextAvailableDate={nextAvailableDate}
              />
            </div>
          ) : null}

          <div className="lm-card">
            <div className="lm-card__title">{labels.booking}</div>
            {agency ? (
              <p className="lm-card__agency">
                {labels.representedBy} <strong>{agency}</strong>
              </p>
            ) : null}
            <div className="lm-book__actions">{inquireButtonSidebar}</div>
            <div className="lm-book__row">
              {shareMenuSidebar}
              {discoveryCta2}
            </div>
          </div>

          {quickFacts.length > 0 ? (
            <div className="lm-card lm-facts">
              <div className="lm-card__title">{labels.quickFacts}</div>
              <dl>
                {quickFacts.map((f) => (
                  <div className="row" key={f.key}>
                    <dt className="k">{f.label}</dt>
                    <dd className="v">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </aside>
      </div>

      {/* ── 3. MORE FROM THIS ROSTER ────────────────────────────────────── */}
      {similarTalent.length > 0 ? (
        <section className="lm-wrap lm-section" aria-label="More talent from this roster">
          <div className="lm-sec-head">
            <span className="lm-eyebrow">{labels.rosterEyebrow}</span>
            <h2>{labels.rosterTitle}</h2>
          </div>
          <div className="lm-similar">
            {similarTalent.map((st) => (
              <div key={st.id} className="lm-similar__card">
                <Link href={st.href} className="lm-similar__media">
                  {st.thumbnailUrl ? (
                    <Image
                      src={st.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div className="lm-similar__mono" aria-hidden="true">
                      {initials(st.displayName)}
                    </div>
                  )}
                  <div className="lm-similar__cap">
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

      {/* ── 4. CTA ──────────────────────────────────────────────────────── */}
      <section className="lm-cta" aria-label={t("public.profile.ctaSectionAria")}>
        <div className="lm-wrap lm-cta__inner">
          <span className="lm-eyebrow">{ui.common.brand}</span>
          <h2 className="lm-display">
            {t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}
          </h2>
          <p>{t("public.profile.footerCtaBody")}</p>
          <div className="lm-cta__btns">
            {inquireButtonFooter}
            {discoveryCta3}
          </div>
        </div>
      </section>

      {/* ── 5. FOOTER (agency host only) ────────────────────────────────── */}
      {showFooter ? (
        <footer className="lm-foot">
          <div className="lm-wrap">
            <div className="lm-foot__row">
              <div style={{ color: "var(--pp-muted)", fontSize: 13 }}>
                <PublicCmsFooterNav locale={locale} />
              </div>
              <span className="lm-foot__pw">
                Powered by <em>Tulala</em>
              </span>
            </div>
          </div>
        </footer>
      ) : null}

      {/* Spacer so the fixed mobile bar never covers footer content. */}
      <div style={{ height: 88 }} className="lg:hidden" aria-hidden="true" />

      {/* ── 6. STICKY BAR (mobile/tablet only) ──────────────────────────── */}
      <div className="lm-bookbar lg:hidden" data-profile-sticky-bar="visible">
        <div className="lm-bookbar__inner">
          <div className="lm-bookbar__who">
            <span className="lm-bookbar__n">{name}</span>
            <span className="lm-bookbar__s">{primaryType ?? ""}</span>
          </div>
          {inquireButtonFooter}
        </div>
      </div>
    </main>
  );
}
