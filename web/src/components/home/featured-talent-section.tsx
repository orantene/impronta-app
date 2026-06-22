import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { TalentCard } from "@/components/talent-cards/TalentCard";
import type { CanonicalTalentCardData } from "@/components/talent-cards/talent-card-shape";
import { AVAILABILITY_UNKNOWN } from "@/lib/site-admin/sections/directory/card-data";

export type FeaturedTalentCard = {
  id: string;
  profileCode: string;
  displayName: string;
  talentType: string;
  location: string;
  thumbnailUrl: string | null;
};

export type FeaturedTalentSectionCopy = {
  sectionKicker: string;
  sectionTitle: string;
  viewAll: string;
  viewAllMobile: string;
  brandPlaceholder: string;
};

export type FeaturedTalentEmptyState = {
  brandLabel: string;
  inquiryHref: string;
};

/**
 * P3 — map this section's narrow card row onto the canonical
 * `CanonicalTalentCardData` so the home featured grid renders the ONE shared
 * `<TalentCard>` (emitting `className="talent-card"` + `data-card-*` hooks and
 * reading the per-tenant card tokens) instead of bespoke gold-token markup.
 *
 * `profileHref` is built by EXACT profile_code then tenant- + locale-prefixed,
 * matching the prior whole-card `<Link>` target. This row carries no
 * secondary-type / language / availability data, so those degrade gracefully
 * (the card omits them; availability shows the ratified unknown fallback only
 * when its toggle is on, which the home grid keeps off).
 */
function homeCardToCanonical(
  t: FeaturedTalentCard,
  locale: Locale,
  publicPathPrefix: string,
): CanonicalTalentCardData {
  const code = t.profileCode?.trim() || null;
  const profileHref = code
    ? withLocalePath(
        prefixPublicHref(`/t/${encodeURIComponent(code)}`, publicPathPrefix),
        locale,
      )
    : "";
  return {
    id: t.id,
    name: t.displayName,
    profileCode: code,
    profileHref,
    primaryType: t.talentType || null,
    location: t.location || null,
    photoUrl: t.thumbnailUrl,
    agencyName: null,
    isExclusive: false,
    availabilityLabel: AVAILABILITY_UNKNOWN,
    availabilityKnown: false,
    availableDaysInNext30: null,
  };
}

export function FeaturedTalentSection({
  talent,
  locale,
  copy,
  publicPathPrefix = "",
  emptyState,
}: {
  talent: FeaturedTalentCard[];
  locale: Locale;
  copy: FeaturedTalentSectionCopy;
  publicPathPrefix?: string;
  emptyState?: FeaturedTalentEmptyState;
}) {
  if (talent.length === 0) {
    if (!emptyState) return null;
    return (
      <section className="w-full px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-10 text-center">
            <div className="text-4xl" aria-hidden>
              🎭
            </div>
            <h2 className="mt-4 font-display text-xl font-medium tracking-wide text-foreground sm:text-2xl">
              Roster coming online
            </h2>
            <p className="mt-3 text-sm text-[var(--impronta-muted)] sm:text-base">
              {emptyState.brandLabel} is finalizing their talent showcase. Send your project brief and we&apos;ll match the right fit.
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href={emptyState.inquiryHref}>
                  Send an inquiry <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
              {copy.sectionKicker}
            </h2>
            <p className="mt-2 text-2xl font-light tracking-wide text-foreground sm:text-3xl">
              {copy.sectionTitle}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="hidden text-[var(--impronta-muted)] hover:text-[var(--impronta-gold)] sm:flex" asChild>
            <Link
              href={withLocalePath(
                prefixPublicHref("/directory?sort=featured", publicPathPrefix),
                locale,
              )}
            >
              {copy.viewAll} <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {talent.map((t, i) => (
            // The canonical <TalentCard> emits `className="talent-card"` +
            // `data-card-*` hooks and reads the per-tenant card tokens, so the
            // active directory-card family repaints this home grid too. The
            // responsive "5th+ card hidden on mobile" rule lives on the
            // wrapper (the card itself is the <Link>).
            <div
              key={t.id}
              className={i >= 4 ? "hidden sm:block" : undefined}
            >
              <TalentCard
                data={homeCardToCanonical(t, locale, publicPathPrefix)}
                style="portrait"
                show={{
                  showName: true,
                  showTalentType: true,
                  showLocation: true,
                  showAvailability: false,
                  showBadges: false,
                }}
                nameFallback="role"
                aspect="3:4"
                priority={i < 4}
                index={i}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 text-center sm:hidden">
          <Button variant="outline" size="sm" asChild>
            <Link
              href={withLocalePath(
                prefixPublicHref("/directory?sort=featured", publicPathPrefix),
                locale,
              )}
            >
              {copy.viewAllMobile} <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
