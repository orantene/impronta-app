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
import { TalentStorefront } from "../_shared/TalentStorefront";
import { SkillsExperienceBlock } from "../_light/SkillsExperienceBlock";
import { AvailabilityWidget } from "../_light/AvailabilityWidget";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import { PublicFeaturedMedia } from "@/components/talent/connections/PublicFeaturedMedia";
import { TalentExtrasBands } from "../_shared/TalentExtrasBands";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TestimonialsSection } from "@/components/reviews/TestimonialsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { NoirBookbarAutoHide, NoirReveal } from "./NoirReveal";
import {
  heroRatingChipLabel,
  type LightProfileLayoutProps,
} from "../_light/LightProfileLayout";
import { ExclusiveRepresentationLine } from "../_shared/ExclusiveRepresentationLine";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";
import { ReviewsAnchorLink } from "../_shared/ReviewsAnchorLink";
import { NOIR_CSS } from "./noir-css";

type DetailRow = { key: string; label: string; value: string; group: string };
/** Group detail rows by resolved group label, first-seen order. */
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
  // WCAG AA: at 0.44 this token measured 3.64:1 on the profile ground (needs
  // 4.5 for 10px text). 0.56 -> 5.30:1 and still reads as the muted tier.
  "--plt-muted-soft": "rgba(236,228,211,0.56)",
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
  // radii — Noir is square-modern (sharp editorial corners everywhere)
  "--plt-radius-sm": "0px",
  "--plt-radius-md": "0px",
  "--plt-radius-lg": "0px",
  "--plt-radius-xl": "1px",
};

// Scoped Noir styles. Every selector is namespaced under [data-profile-theme="noir"].

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

  const isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic";
  // The wide "hero" media renders as a full-bleed banner across the top; the
  // card image is the overlapping portrait. bannerUrl stays a portrait fallback
  // only when there is no card image, so no talent loses their face.
  const bannerImg = bannerUrl;
  const portraitImg = profileImageUrl ?? bannerUrl;
  const agency = agencyDisplayName ?? agencyName;

  // Hero chips ------------------------------------------------------------
  const langShort = languages
    .map((l) => l.split(" (")[0].trim())
    .filter(Boolean)
    .slice(0, 4);
  const travels = serviceAreas.some((s) => s.service_kind === "travel_to");
  // The parent talent type leads the hero (eyebrow); the remaining types are
  // the talent's child specialties, surfaced as a quieter strip so the header
  // reads clean instead of a wall of five roles.
  const parentType = primaryType ?? (allTalentTypes[0] ?? null);
  const childTypes = allTalentTypes.filter((tt) => tt !== parentType);
  const eyebrowLine = parentType;

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
  const hasStorefront = !isFreePlan && storefrontOfferings.length > 0;
  const hasServiceMenu = hasStorefront || (!isFreePlan && serviceMenuItems.length > 0);
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
    alsoSpecialties: pickLocale(locale, { en: "Also", es: "También" }),
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
      // Sticky book bar starts stowed: at first paint the hero's own
      // "Inquire" button is on screen, so a second identical CTA in the
      // bottom bar is pure duplication. NoirBookbarAutoHide reveals it once
      // the hero CTA scrolls away; the <noscript> style below forces it
      // visible when JS never runs, so the CTA is never unreachable.
      data-bookbar="idle"
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
        <style>{`[data-profile-theme="noir"] [data-nf-reveal]{opacity:1!important;transform:none!important}[data-profile-theme="noir"][data-bookbar="idle"] .nf-bookbar{transform:none!important;opacity:1!important;pointer-events:auto!important}`}</style>
      </noscript>
      <NoirReveal />
      <NoirBookbarAutoHide />

      {resolvedPreview ? (
        <div className="nf-preview-banner">{t("public.profile.previewModeBanner")}</div>
      ) : null}

      {/* ── 1. HERO (full-bleed banner + overlapping portrait) ──────────── */}
      <section data-profile-section="hero">
        {bannerImg ? (
          <div className="nf-banner">
            <Image
              src={bannerImg}
              alt={`${name}, banner`}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: "cover" }}
            />
            <span className="nf-banner__frame" aria-hidden="true" />
          </div>
        ) : null}
        <div className={`nf-wrap nf-hero${bannerImg ? " nf-hero--overlap" : ""}`}>
          <div className="nf-portrait">
            {portraitImg ? (
              <Image
                src={portraitImg}
                alt={`${name}, portrait`}
                fill
                priority
                sizes="(min-width: 900px) 360px, 80vw"
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
            {heroRating && meetsCredibilityFloor(heroRating.ratingCount) ? (
              <ReviewsAnchorLink className="nf-chip nf-chip--gold">
                {heroRatingChipLabel(heroRating.ratingAvg, heroRating.ratingCount, locale)}
              </ReviewsAnchorLink>
            ) : null}
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
          {agency && props.isExclusive ? (
            <ExclusiveRepresentationLine
              agency={agency}
              t={props.t}
              className="mt-3 text-[11px] tracking-[0.02em]"
              style={{ color: "rgba(236,228,211,0.6)" }}
              tone="dark"
            />
          ) : null}

          {aboutText.trim() ? <p className="nf-bio">{aboutText}</p> : null}

          {childTypes.length > 0 ? (
            <div className="nf-specialties">
              <span className="nf-specialties__label">{labels.alsoSpecialties}</span>
              {childTypes.slice(0, 5).map((tt) => (
                <span key={tt} className="nf-chip">{tt}</span>
              ))}
              {childTypes.length > 5 ? (
                <span className="nf-chip nf-chip--more">+{childTypes.length - 5}</span>
              ) : null}
            </div>
          ) : null}

          <div className="nf-actions">
            {inquireButtonHeader}
            {galleryItems.length > 0 ? (
              <a href="#nf-portfolio" className="nf-btn nf-btn--ghost">
                {labels.viewPortfolio} <span className="arr">↓</span>
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

      <TalentExtrasBands family="noir" locale={locale} embeds={props.talentEmbeds} press={props.talentPressItems} />

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
        <section id="reviews" className="nf-wrap nf-section" data-profile-section="reviews" data-nf-reveal>
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
            talentName={name}
          />
        </section>
      ) : null}

      {/* ── 8b. INVITED TESTIMONIALS (separate from verified reviews) ────── */}
      {testimonials.length > 0 ? (
        <section
          className="nf-wrap nf-section"
          data-profile-section="testimonials"
          data-nf-reveal
        >
          <TestimonialsSection testimonials={testimonials} theme="dark" />
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
                  portraitUrl={st.thumbnailUrl ?? null}
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
          {props.slotPicker}
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
              {props.whitelabel ? null : (
                <span className="nf-foot__pw">
                  Powered by <em>Tulala</em>
                </span>
              )}
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
