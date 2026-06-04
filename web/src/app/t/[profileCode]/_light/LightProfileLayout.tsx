/**
 * LightProfileLayout — the main layout shell for the light, clean, editorial
 * free-default talent profile. Consumes all data props and assembled RSC
 * component slots from page.tsx.
 *
 * Sections (top → bottom):
 *   1. COVER (ProfileCover / Monogram fallback)
 *   2. HEADER (ProfileHeader — overlaps cover)
 *   3. PORTFOLIO BAND (PortfolioGalleryLightbox)
 *   4. BODY 70/30: LEFT (About → Services → Skills → Reviews)
 *              RIGHT sticky: BookingCard
 *   5. CTA section
 *   6. Similar-talent strip
 *   7. Footer
 *
 * Server component — pure presentational, no hooks or client-side state.
 */

import Image from "next/image";
import Link from "next/link";

import { ProfileCover } from "./ProfileCover";
import { ProfileHeader } from "./ProfileHeader";
import { ServicesBlock } from "./ServicesBlock";
import { SkillsExperienceBlock } from "./SkillsExperienceBlock";
import { BookingCard } from "./BookingCard";
import { AvailabilityWidget } from "./AvailabilityWidget";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";
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

  // ── Media ────────────────────────────────────────────────────────────────
  galleryItems: GalleryItem[];
  watermarkPreset: WatermarkPreset | null;
  watermarkLogoUrl: string | null;

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

  // ── Dynamic field rows ───────────────────────────────────────────────────
  basicInfoDetailRows: Array<{ key: string; label: string; value: string }>;
  otherDetailRows: Array<{ key: string; label: string; value: string }>;

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
  shareLabels: {
    heading: string;
    copyLink: string;
    copyLinkDone: string;
    shareWhatsapp: string;
    shareSystem: string;
    whatsappTemplate: string;
  };
  canonicalShareUrl: string;
  profileSourcePage: string;
  portalInquiryHref: string | null;
  resolvedPreview: boolean;
  hostCtxKind: "agency" | "app" | "hub" | "platform";
  tenantId: string;
  tenantSlug: string;

  // ── Component slots (already instantiated by page.tsx) ──────────────────
  inquireButtonHeader: React.ReactNode;
  inquireButtonSidebar: React.ReactNode;
  inquireButtonFooter: React.ReactNode;
  shareMenuHeader: React.ReactNode;
  shareMenuSidebar: React.ReactNode;
  discoveryCta: React.ReactNode;
  discoveryCta2: React.ReactNode;
  discoveryCta3: React.ReactNode;
};

function LightSectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9CA3AF]"
    >
      {children}
    </h2>
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
  galleryItems,
  watermarkPreset,
  watermarkLogoUrl,
  resolvedSkills,
  availableDaysInNext30,
  availabilityDots14d,
  nextAvailableDate,
  packageTeasers,
  serviceAreas,
  startingFrom,
  bookingNote,
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
  shareLabels,
  canonicalShareUrl,
  profileSourcePage,
  portalInquiryHref,
  resolvedPreview,
  inquireButtonHeader,
  inquireButtonSidebar,
  inquireButtonFooter,
  shareMenuHeader,
  shareMenuSidebar,
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

  return (
    <main
      className="flex-1 bg-white"
      data-profile-shell
      data-profile-theme="light"
    >
      {/* Preview mode banner */}
      {resolvedPreview ? (
        <div className="border-b border-[#ECECEC] bg-[#FAFAF8] px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.2em] text-[#6B6B6B] sm:px-6 lg:px-8">
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
      />

      {/* ── 3 + 4. PORTFOLIO + BODY (80/20) ─────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">

        {/* Portfolio band — full-width inside the container */}
        {galleryItems.length > 0 ? (
          <section
            aria-labelledby="portfolio-light-heading"
            className="mb-12"
            data-profile-section="portfolio"
          >
            <LightSectionLabel id="portfolio-light-heading">
              {t("public.profile.portfolio")}
            </LightSectionLabel>
            <div className="mt-5">
              <PortfolioGalleryLightbox
                name={name}
                items={galleryItems.slice(0, 9)}
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
                <p className="mt-4 max-w-2xl text-base leading-[1.9] text-[#3D3D3D]">
                  {aboutText}
                </p>
              </section>
            ) : null}

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
              headingLabel="Skills &amp; Specialties"
            />

            {/* Basic info fields */}
            {basicInfoDetailRows.length > 0 ? (
              <section aria-labelledby="basic-info-light-heading">
                <LightSectionLabel id="basic-info-light-heading">
                  {t("public.profile.basicInfo")}
                </LightSectionLabel>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {basicInfoDetailRows.map((r) => (
                    <div
                      key={r.key}
                      className="rounded-xl border border-[#ECECEC] bg-[#FAFAF8] px-4 py-3"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C4C4C4]">
                        {r.label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#1A1A1A]">
                        {r.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Other dynamic fields */}
            {otherDetailRows.length > 0 ? (
              <section aria-labelledby="details-light-heading">
                <LightSectionLabel id="details-light-heading">
                  {t("public.profile.details")}
                </LightSectionLabel>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {otherDetailRows.map((r) => (
                    <div
                      key={r.key}
                      className="rounded-xl border border-[#ECECEC] bg-[#FAFAF8] px-4 py-3"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C4C4C4]">
                        {r.label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#1A1A1A]">
                        {r.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Reviews (light theme) */}
            {ratingSummary.count > 0 ? (
              <section
                aria-label="Client reviews"
                data-profile-section="reviews"
              >
                <LightSectionLabel>Reviews</LightSectionLabel>
                <div className="mt-5">
                  <TalentReviewsSection
                    summary={ratingSummary}
                    reviews={talentReviews}
                    theme="light"
                    heading={locale === "es" ? "Reseñas" : "Reviews"}
                  />
                </div>
              </section>
            ) : null}
          </div>

          {/* ── Right column (sticky booking card) ──────────────────────── */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
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
        className="border-t border-[#ECECEC] bg-[#FAFAF8]"
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9CA3AF]">
            {ui.common.brand}
          </p>
          <h2 className="font-[family-name:var(--font-cinzel)] text-2xl font-medium tracking-wide text-[#1A1A1A] sm:text-3xl">
            {t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}
          </h2>
          <p className="max-w-md text-base leading-relaxed text-[#6B6B6B]">
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
          className="border-t border-[#ECECEC] bg-white px-4 py-12 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-5xl">
            <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">
              More from this roster
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {similarTalent.map((st) => {
                const href = st.href;
                return (
                  <div key={st.id} className="group/similartile relative">
                    <Link
                      href={href}
                      className="block overflow-hidden rounded-2xl bg-[#F0EDE8]"
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
                          <div className="flex h-full items-center justify-center font-[family-name:var(--font-cinzel)] text-[10px] tracking-widest text-[#C4C4C4]">
                            {ui.common.brand}
                          </div>
                        )}
                        {/* Subtle bottom overlay for text legibility */}
                        <div className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/55 to-transparent p-3">
                          <p className="truncate font-[family-name:var(--font-cinzel)] text-sm font-semibold text-white">
                            {st.displayName}
                          </p>
                          {st.primaryType ? (
                            <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/70">
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
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 7. Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#ECECEC] bg-[#FAFAF8] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center text-sm text-[#9CA3AF]">
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>

      {/* Spacer so the fixed mobile bar never covers the footer content. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      {/* Sticky inquiry bar — mobile/tablet only (desktop has the sticky booking
          card rail, so it's hidden at lg+). Keeps Inquire reachable without
          scrolling to the bottom-stacked booking card on small screens. */}
      <div
        data-profile-sticky-bar="visible"
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
      >
        <div className="m-3 mx-auto flex max-w-4xl items-center gap-4 rounded-full border border-[#ECECEC] bg-white px-6 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <span className="font-[family-name:var(--font-cinzel)] truncate text-base text-[#1A1A1A]">
              {name}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-[#9CA3AF]">
              {primaryType ?? ""}
            </span>
          </div>
          {inquireButtonFooter}
        </div>
      </div>
    </main>
  );
}
