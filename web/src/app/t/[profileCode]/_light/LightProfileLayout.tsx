/**
 * LightProfileLayout — the main layout shell for the public talent profile,
 * rebuilt on the tulala.digital marketing design system (--plt tokens +
 * plt-display headings). Consumes all data props and assembled RSC component
 * slots from page.tsx.
 *
 * Sections (top → bottom):
 *   1. COVER (ProfileCover / Monogram fallback)
 *   2. HEADER (ProfileHeader — overlaps cover; carries hubs indicator)
 *   3. PORTFOLIO BAND (editorial gallery → PortfolioGalleryLightbox)
 *   4. BODY 70/30: LEFT (About → Services → Skills → Details → Reviews)
 *              RIGHT sticky: BookingCard
 *   5. CTA section
 *   6. Similar-talent strip
 *   7. Footer (agency host only — platform host uses MarketingFooter)
 *
 * Server component — pure presentational, no hooks or client-side state.
 */

import Image from "next/image";
import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";

import { ProfileCover } from "./ProfileCover";
import { ProfileHeader } from "./ProfileHeader";
import { ServicesBlock } from "./ServicesBlock";
import { ServiceMenuBlock } from "./ServiceMenuBlock";
import { SkillsExperienceBlock } from "./SkillsExperienceBlock";
import { BookingCard } from "./BookingCard";
import { AvailabilityWidget } from "./AvailabilityWidget";
import { LightSectionLabel } from "./section-label";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import {
  PublicFeaturedMedia,
  type PublicFeaturedMediaItem,
} from "@/components/talent/connections/PublicFeaturedMedia";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";
import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";
import type { TalentServiceAreaRow } from "../page";
import type { TalentRatingSummary, TalentReview } from "@/lib/reviews/review-types";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

// ─── WatermarkPreset (mirrors the type from PortfolioGalleryLightbox) ────────
type WatermarkPreset = {
  enabled: boolean;
  position: string;
  size_pct: number;
  opacity: number;
  padding_pct: number;
  variant: string;
};

type GalleryItem = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

type SimilarTalentMini = {
  id: string;
  profileCode: string;
  displayName: string;
  primaryType: string | null;
  thumbnailUrl: string | null;
  /** Pre-built public href (via prefixPublicHref in page.tsx). */
  href: string;
};

type PackageTeaser = { label: string; detail: string | null };

/** A profile detail field row, with the resolved group label for card grouping. */
type DetailRow = { key: string; label: string; value: string; group: string };

type LightProfileLayoutProps = {
  // ── Profile ─────────────────────────────────────────────────────────────
  name: string;
  firstName: string;
  profileCode: string;
  profileImageUrl: string | null;
  bannerUrl: string | null;
  isFeatured: boolean;
  aboutText: string;
  allTalentTypes: string[];
  primaryType: string | null;
  livesIn: string | null;
  originallyFrom: string | null;
  languages: string[];
  locale: string;

  // ── Plan / gating ────────────────────────────────────────────────────────
  /** talent_basic → free. talent_pro / talent_portfolio → social links + embeds visible. */
  talentPlanKey: string;

  /**
   * Max site URL. Non-null ONLY when the talent is on the Max plan AND has a
   * published site. Passed through to ProfileHeader for the VIP badge + CTA.
   */
  maxSiteUrl?: string | null;

  // ── Media ────────────────────────────────────────────────────────────────
  galleryItems: GalleryItem[];
  watermarkPreset: WatermarkPreset | null;
  watermarkLogoUrl: string | null;
  /** Talent-selected manual featured-media embeds (showcase only, NOT verified). */
  featuredMediaItems: PublicFeaturedMediaItem[];

  // ── Skills + availability ────────────────────────────────────────────────
  resolvedSkills: ResolvedSkill[];
  availableDaysInNext30: number | null;
  availabilityDots14d: string | null;
  nextAvailableDate: string | null;

  // ── Services ─────────────────────────────────────────────────────────────
  packageTeasers: PackageTeaser[];
  serviceAreas: TalentServiceAreaRow[];
  startingFrom: string | null;
  bookingNote: string | null;
  /** S12 — talent-configured services menu (public/on-request items). */
  serviceMenuItems: ServiceMenuItem[];
  /** S6 — discipline term id → label, for per-service scoping chips. */
  disciplineLabels: Record<string, string>;

  // ── Taxonomy chips ───────────────────────────────────────────────────────
  fitLabels: string[];
  skills: string[];
  industries: string[];
  eventTypes: string[];
  tags: string[];
  fieldVisibility: {
    showFitLabels: boolean;
    showSkills: boolean;
    showLanguages: boolean;
    showIndustries: boolean;
    showEventTypes: boolean;
    showTags: boolean;
  };

  // ── Dynamic field rows (carry group labels for premium card grouping) ─────
  basicInfoDetailRows: DetailRow[];
  otherDetailRows: DetailRow[];

  // ── Reviews ──────────────────────────────────────────────────────────────
  ratingSummary: TalentRatingSummary;
  talentReviews: TalentReview[];

  // ── Agency overlay ───────────────────────────────────────────────────────
  agencyName: string | null;
  agencyDisplayName: string | null;

  // ── Similar talent ───────────────────────────────────────────────────────
  /** Similar talent with href already computed via prefixPublicHref. */
  similarTalent: SimilarTalentMini[];

  // ── UI copy ──────────────────────────────────────────────────────────────
  ui: Pick<DirectoryUiCopy, "lightbox" | "common" | "profileCta" | "inquiry" | "card" | "flash" | "preview">;
  t: (key: string) => string;
  detailsLabels: { measurements: string; logistics: string; experience: string; details: string };
  canonicalShareUrl: string;
  profileSourcePage: string;
  portalInquiryHref: string | null;
  resolvedPreview: boolean;
  hostCtxKind: "agency" | "app" | "hub" | "platform";
  tenantId: string;
  tenantSlug: string;
  /** Platform host renders MarketingFooter outside the layout → suppress the in-layout footer. */
  showFooter: boolean;

  // ── Component slots (already instantiated by page.tsx) ──────────────────
  inquireButtonHeader: React.ReactNode;
  inquireButtonSidebar: React.ReactNode;
  inquireButtonFooter: React.ReactNode;
  shareMenuHeader: React.ReactNode;
  shareMenuSidebar: React.ReactNode;
  hubsIndicator: React.ReactNode;
  discoveryCta: React.ReactNode;
  discoveryCta2: React.ReactNode;
  discoveryCta3: React.ReactNode;
};

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

function DetailCard({ rows, group }: { group: string; rows: DetailRow[] }) {
  return (
    <div
      className="rounded-[var(--plt-radius-lg)] border p-5"
      style={{
        borderColor: "var(--plt-hairline)",
        background: "var(--plt-bg-raised)",
      }}
    >
      <p
        className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "var(--plt-forest)" }}
      >
        {group}
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5">
            <dt
              className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--plt-muted-soft)" }}
            >
              {r.label}
            </dt>
            <dd className="text-sm font-medium" style={{ color: "var(--plt-ink)" }}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function LightProfileLayout({
  name,
  firstName,
  profileCode,
  profileImageUrl,
  bannerUrl,
  isFeatured,
  aboutText,
  allTalentTypes,
  primaryType,
  livesIn,
  originallyFrom,
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
  inquireButtonSidebar,
  inquireButtonFooter,
  shareMenuHeader,
  shareMenuSidebar,
  hubsIndicator,
  discoveryCta,
  discoveryCta2,
  discoveryCta3,
}: LightProfileLayoutProps) {
  // Free-tier gating: talent_basic = gate social/embeds
  const isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic";

  // Primary skill for the experience line
  const primarySkill =
    resolvedSkills.find((s) => s.relationship_type === "primary_role") ?? null;

  const hasCover = Boolean(bannerUrl);

  // Premium grouped details: basic-info first (relabelled), then the rest by group.
  const groupedBasic =
    basicInfoDetailRows.length > 0
      ? [{ group: detailsLabels.measurements, rows: basicInfoDetailRows }]
      : [];
  const groupedOther = groupDetailRows(otherDetailRows);
  const detailGroups = [...groupedBasic, ...groupedOther];

  return (
    <main
      className="flex-1"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
      data-profile-shell
      data-profile-theme="light"
    >
      {/* Preview mode banner */}
      {resolvedPreview ? (
        <div
          className="plt-mono border-b px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.2em] sm:px-6 lg:px-8"
          style={{
            borderColor: "var(--plt-hairline)",
            background: "var(--plt-bg-raised)",
            color: "var(--plt-muted)",
          }}
        >
          {t("public.profile.previewModeBanner")}
        </div>
      ) : null}

      {/* ── 1. COVER ─────────────────────────────────────────────────────── */}
      <ProfileCover
        bannerUrl={bannerUrl}
        name={name}
        isFeatured={isFeatured}
        featuredLabel={ui.card.featuredLabel}
      />

      {/* ── 2. HEADER (overlaps cover) ───────────────────────────────────── */}
      <ProfileHeader
        name={name}
        profileImageUrl={profileImageUrl}
        allTalentTypes={allTalentTypes}
        primaryType={primaryType}
        primarySkill={primarySkill}
        livesIn={livesIn}
        originallyFrom={originallyFrom}
        languages={languages}
        hasCover={hasCover}
        profileCode={profileCode}
        isFeatured={isFeatured}
        inquireButton={inquireButtonHeader}
        shareMenu={shareMenuHeader}
        discoveryCta={discoveryCta}
        hubsIndicator={hubsIndicator}
        maxSiteUrl={maxSiteUrl}
      />

      {/* ── 3 + 4. PORTFOLIO + BODY (70/30) ─────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {/* Portfolio band — editorial gallery, full-width inside the container */}
        {galleryItems.length > 0 ? (
          <section
            aria-labelledby="portfolio-light-heading"
            className="mb-14"
            data-profile-section="portfolio"
          >
            <div className="flex items-baseline justify-between gap-4">
              <LightSectionLabel id="portfolio-light-heading">
                {t("public.profile.portfolio")}
              </LightSectionLabel>
              {galleryItems.length > 9 ? (
                <span
                  className="plt-mono text-[0.625rem] uppercase tracking-[0.14em]"
                  style={{ color: "var(--plt-muted-soft)" }}
                >
                  {galleryItems.length} works
                </span>
              ) : null}
            </div>
            <div className="mt-5">
              <PortfolioGalleryLightbox
                name={name}
                items={galleryItems.slice(0, 12)}
                lightbox={ui.lightbox}
                closeLabel={ui.preview.close}
                watermarkPreset={watermarkPreset}
                watermarkLogoUrl={watermarkLogoUrl}
              />
            </div>
          </section>
        ) : null}

        {/* 70/30 body */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_296px] lg:gap-12">
          {/* ── Left column (main) ──────────────────────────────────────── */}
          <div className="space-y-12">
            {/* About */}
            {aboutText.trim() ? (
              <section aria-labelledby="about-light-heading" data-profile-section="about">
                <LightSectionLabel id="about-light-heading">
                  {t("public.profile.about")}
                </LightSectionLabel>
                <p
                  className="mt-4 max-w-2xl text-base leading-[1.85]"
                  style={{ color: "var(--plt-ink-soft)" }}
                >
                  {aboutText}
                </p>
              </section>
            ) : null}

            {/* Featured media — talent-selected manual showcase embeds */}
            <PublicFeaturedMedia
              items={featuredMediaItems}
              heading={t("public.profile.editorial.watchListen")}
            />

            {/* Mobile availability (shown only on small screens, above services) */}
            <div className="lg:hidden">
              <AvailabilityWidget
                availableDaysInNext30={availableDaysInNext30}
                availabilityDots14d={availabilityDots14d}
                nextAvailableDate={nextAvailableDate}
              />
            </div>

            {/* Services block */}
            <ServicesBlock
              packageTeasers={isFreePlan ? [] : packageTeasers}
              serviceAreas={serviceAreas}
              startingFrom={startingFrom}
              bookingNote={bookingNote}
              locale={locale}
              heading="Services"
              packagesLabel={t("public.profile.editorial.packages")}
              bookingDetailsLabel={t("public.profile.editorial.bookingDetails")}
            />

            {/* Services menu — talent-configured services & pricing (S12) */}
            <ServiceMenuBlock
              items={isFreePlan ? [] : serviceMenuItems}
              locale={locale}
              heading={pickLocale(locale, { en: "Services & pricing", es: "Servicios y precios" })}
              disciplineLabels={disciplineLabels}
            />

            {/* Skills & specialties */}
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
              headingLabel="Skills & Specialties"
            />

            {/* Details — premium grouped cards (NOT a flat list) */}
            {detailGroups.length > 0 ? (
              <section aria-labelledby="details-light-heading" data-profile-section="details">
                <LightSectionLabel id="details-light-heading">
                  {detailsLabels.details}
                </LightSectionLabel>
                <div className="mt-5 space-y-4">
                  {detailGroups.map((g) => (
                    <DetailCard key={g.group} group={g.group} rows={g.rows} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Reviews */}
            {ratingSummary.count > 0 ? (
              <section aria-label="Client reviews" data-profile-section="reviews">
                <LightSectionLabel>Reviews</LightSectionLabel>
                <div className="mt-5">
                  <TalentReviewsSection
                    summary={ratingSummary}
                    reviews={talentReviews}
                    theme="light"
                    heading={pickLocale(locale, { en: "Reviews", es: "Reseñas" })}
                  />
                </div>
              </section>
            ) : null}
          </div>

          {/* ── Right column (sticky booking card) ──────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <BookingCard
              agencyName={agencyDisplayName ?? agencyName}
              inquireButton={inquireButtonSidebar}
              shareMenu={shareMenuSidebar}
              discoveryCta={discoveryCta2}
              availableDaysInNext30={availableDaysInNext30}
              availabilityDots14d={availabilityDots14d}
              nextAvailableDate={nextAvailableDate}
            />
          </aside>
        </div>
      </div>

      {/* ── 5. CTA section ──────────────────────────────────────────────── */}
      <section
        aria-label={t("public.profile.ctaSectionAria")}
        className="border-t"
        style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-deep)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:px-8">
          <p
            className="plt-mono text-[0.6875rem] font-semibold uppercase tracking-[0.28em]"
            style={{ color: "var(--plt-forest)" }}
          >
            {ui.common.brand}
          </p>
          <h2
            className="plt-display max-w-xl text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
            style={{ color: "var(--plt-ink-strong)" }}
          >
            {t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}
          </h2>
          <p
            className="max-w-md text-base leading-relaxed"
            style={{ color: "var(--plt-muted)" }}
          >
            {t("public.profile.footerCtaBody")}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {inquireButtonFooter}
            {discoveryCta3}
          </div>
        </div>
      </section>

      {/* ── 6. Similar-talent strip ──────────────────────────────────────── */}
      {similarTalent.length > 0 ? (
        <section
          aria-label="More talent from this roster"
          className="border-t px-4 py-12 sm:px-6 lg:px-8"
          style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg)" }}
        >
          <div className="mx-auto max-w-5xl">
            <p
              className="plt-mono mb-6 text-[0.6875rem] font-semibold uppercase tracking-[0.24em]"
              style={{ color: "var(--plt-forest)" }}
            >
              More from this roster
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {similarTalent.map((st) => (
                <div key={st.id} className="group/similartile relative">
                  <Link
                    href={st.href}
                    className="block overflow-hidden rounded-[var(--plt-radius-lg)]"
                    style={{ background: "var(--plt-bg-deep)" }}
                  >
                    <div className="relative aspect-[3/4] w-full">
                      {st.thumbnailUrl ? (
                        <Image
                          src={st.thumbnailUrl}
                          alt=""
                          fill
                          className="object-cover transition-transform duration-300 group-hover/similartile:scale-[1.02]"
                          sizes="(min-width: 640px) 25vw, 50vw"
                        />
                      ) : (
                        <div
                          className="plt-display flex h-full items-center justify-center text-[0.625rem] tracking-widest"
                          style={{ color: "var(--plt-muted-soft)" }}
                        >
                          {ui.common.brand}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 rounded-b-[var(--plt-radius-lg)] bg-gradient-to-t from-black/60 to-transparent p-3">
                        <p className="plt-display truncate text-sm font-semibold text-white">
                          {st.displayName}
                        </p>
                        {st.primaryType ? (
                          <p className="plt-mono truncate text-[0.625rem] uppercase tracking-[0.12em] text-white/70">
                            {st.primaryType}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                  <TalentCardActions
                    talentProfileId={st.id}
                    profileCode={st.profileCode}
                    displayName={st.displayName}
                    sourcePage={profileSourcePage}
                    variant="compact"
                    className="absolute right-2.5 top-2.5 z-[2]"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 7. Footer (agency host only) ─────────────────────────────────── */}
      {showFooter ? (
        <footer
          className="border-t px-4 py-8 sm:px-6 lg:px-8"
          style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-deep)" }}
        >
          <div
            className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center text-sm"
            style={{ color: "var(--plt-muted)" }}
          >
            <PublicCmsFooterNav locale={locale} />
          </div>
        </footer>
      ) : null}

      {/* Spacer so the fixed mobile bar never covers the footer content. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      {/* Sticky inquiry bar — mobile/tablet only (desktop has the sticky booking
          card rail, so it's hidden at lg+). */}
      <div data-profile-sticky-bar="visible" className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
        <div
          className="m-3 mx-auto flex max-w-4xl items-center gap-4 rounded-full border px-6 py-2.5"
          style={{
            borderColor: "var(--plt-hairline-strong)",
            background: "var(--plt-bg-elevated)",
            boxShadow: "var(--plt-shadow-lg)",
          }}
        >
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <span className="plt-display truncate text-base font-semibold" style={{ color: "var(--plt-ink-strong)" }}>
              {name}
            </span>
            <span
              className="plt-mono text-[0.6875rem] uppercase tracking-[0.18em]"
              style={{ color: "var(--plt-muted-soft)" }}
            >
              {primaryType ?? ""}
            </span>
          </div>
          {inquireButtonFooter}
        </div>
      </div>
    </main>
  );
}
