/**
 * Presentational server-rendered card for the featured_talent section.
 *
 * Why not reuse `<TalentCard />` from /directory?
 *   - That component is a client component with save / share / inquiry /
 *     quick-preview interactivity that the homepage surface doesn't need.
 *   - The homepage featured grid is a showcase — cards link straight to
 *     the profile page and inherit the active directory card family CSS
 *     via the same `talent-card` class and `data-card-*` attribute hooks.
 *   - Going server-only here keeps the homepage zero-client-JS for this
 *     slot and avoids pulling the full discovery state context into a
 *     surface that doesn't need it.
 *
 * Phase 6A — reusable premium card system. Visual parity with the
 * prototype card chrome (stronger frame, elevated hover, clear name /
 * type / meta hierarchy, premium action row) is delivered entirely via
 * the shared `.talent-card` family + `data-card-*` hooks + tenant design
 * tokens — NOT hardcoded Impronta styling. Every tenant's active card
 * family repaints these same hooks.
 *
 * Hooks emitted:
 *   data-card-media · data-card-ribbon · data-card-name ·
 *   data-card-kicker · data-card-meta · data-card-availability ·
 *   data-card-actions
 */
import { memo } from "react";

import Image from "next/image";
import Link from "next/link";

import type { FeaturedTalentCardDTO } from "./fetch";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { withLocaleHref, type LocaleUrlSettings } from "@/i18n/pathnames";
import { TalentCardEmptyPlate } from "@/components/talent-cards/talent-card-empty-plate";

function profileHref(card: FeaturedTalentCardDTO): string {
  const code = encodeURIComponent(card.profileCode);
  // The /t/ route resolves by EXACT profile_code; a `-<slug>` suffix 404s
  // (and slugPart can equal the code, doubling it). Link by code only.
  return `/t/${code}`;
}

/**
 * Phase 6A.3 — render controls. All visibility flags follow the codebase
 * convention `undefined === shown` (back-compat: existing compositions are
 * visually unchanged for fields they already showed; new metadata only
 * appears when the talent actually has it).
 *
 * `showSecondaryType` / `showLanguages` are now backed by real DTO data on
 * the direct-query path (manual_pick / by_service / by_destination). On the
 * cached-directory path the DTO carries empty values, so the card simply
 * omits them — never fake.
 *
 * `showAvailability` is honoured structurally but `availabilityLabel` is
 * never populated yet (no reliable public source), so it never renders.
 * `parentCategoryDisplay` is reserved — the DTO has no taxonomy hierarchy
 * yet; it falls back to the primary type label.
 */
export interface FeaturedTalentCardDisplay {
  showName?: boolean;
  showPrimaryType?: boolean;
  showSecondaryType?: boolean;
  showCity?: boolean;
  showLanguages?: boolean;
  showAvailability?: boolean;
  showBadge?: boolean;
  /** Reserved — DTO has no parent-category yet; falls back to primary type. */
  parentCategoryDisplay?: boolean;
  cardVariant?: "editorial" | "compact" | "minimal" | "profile";
  showBookmarkIcon?: boolean;
  cardChrome?: "standard" | "v11-noir";
  imageTreatment?: "natural" | "cinematic";
  actionStyle?: "primary-duo" | "outline-duo";
}

function FeaturedTalentCardInner({
  card,
  priority,
  publicPathPrefix = "",
  display,
  requestCta,
  locale,
  localeSettings,
}: {
  card: FeaturedTalentCardDTO;
  /** First row can opt into Next/Image priority for LCP. */
  priority?: boolean;
  publicPathPrefix?: string;
  display?: FeaturedTalentCardDisplay;
  /** Optional per-card Request/add-to-inquiry CTA. */
  requestCta?: { label: string; href: string } | null;
  /**
   * Active content locale. The card's own chrome ("View profile") was a
   * hardcoded English literal, so a Spanish storefront rendered it right next
   * to the translated Request button — visible on the live
   * improntamodels.com/es homepage. Unlike the section's authored copy this is
   * component chrome, so it is translated here rather than through the
   * per-element overlay. Omitted / unknown locale → English, so every existing
   * call site stays byte-identical.
   */
  locale?: string;
  /**
   * Tenant URL grammar (default locale + published locales). Needed because the
   * card links to a talent profile, and `/t/<code>` has a real per-locale route
   * (`/es/t/<code>` renders `lang="es"` with Spanish chrome) — without the
   * prefix a Spanish visitor clicking a card landed on the English page.
   * Omitted → platform defaults, which no-op for a default-locale render.
   */
  localeSettings?: LocaleUrlSettings;
}) {
  // Tenant path prefix first (path-hosted tenants), then the LOCALE prefix —
  // `withLocaleHref` no-ops on the default locale, so the English render stays
  // byte-identical.
  const tenantScopedHref = prefixPublicHref(profileHref(card), publicPathPrefix);
  // An EMPTY locale must skip localization entirely: `withLocalePath` would
  // treat "" as a segment and emit `//t/<code>` — a protocol-relative URL
  // pointing at another host.
  const href = locale
    ? withLocaleHref(tenantScopedHref, locale, localeSettings)
    : tenantScopedHref;
  const viewProfileLabel = locale === "es" ? "Ver perfil" : "View profile";
  // New 6A.2 fields are optional on the DTO (back-compat for pre-6A
  // constructors); normalize once so the render path stays clean.
  const cardLanguages = card.languages ?? [];
  const showName = display?.showName !== false;
  const showPrimary = display?.showPrimaryType !== false;
  const showSecondary =
    display?.showSecondaryType !== false && !!card.secondaryTalentTypeLabel;
  const showCity = display?.showCity !== false && !!card.locationLabel;
  const showLanguages =
    display?.showLanguages !== false && cardLanguages.length > 0;
  // Layout-ready: only renders when a real label exists (never fabricated).
  const showAvailability =
    display?.showAvailability !== false && !!card.availabilityLabel;
  const showBadge = display?.showBadge !== false && card.isFeatured;
  const variant = display?.cardVariant ?? "editorial";
  const cardChrome = display?.cardChrome ?? "standard";
  const imageTreatment = display?.imageTreatment ?? "natural";
  const actionStyle = display?.actionStyle ?? "primary-duo";

  const wrapClass =
    "talent-card site-featured-talent__card group/card relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl";

  // Secondary type and languages share one subtle meta line under the
  // kicker. Languages are capped at 3 in the fetch layer.
  const languageLine = showLanguages ? cardLanguages.join(" · ") : null;
  const hasMetaLine = showSecondary || !!languageLine;

  const media = (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden bg-muted"
      data-card-media
    >
      {card.thumbnailUrl ? (
        <Image
          src={card.thumbnailUrl}
          alt={card.displayName}
          fill
          className="object-cover transition-transform duration-[650ms] ease-out group-hover/card:scale-[1.05]"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
        />
      ) : (
        // No-photo state — the SAME plate the canonical <TalentCard> renders.
        //
        // The comment that stood here claimed this "Matches the canonical
        // <TalentCard> fallback". It did not: the canonical card drew a line-art
        // silhouette while this one set the talent's NAME large — two siblings
        // with two different empty states and a comment asserting they agreed.
        // Worse, the name is already rendered in the caption below, so an empty
        // featured card printed it twice.
        //
        // Both now render `TalentCardEmptyPlate`, so the J9 rules are enforced
        // in one place and a future change cannot fix one card and miss the
        // other. The discipline is the image (rule 02).
        <TalentCardEmptyPlate discipline={card.primaryTalentTypeLabel} />
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
        data-card-scrim
        aria-hidden
      />

      {showBadge ? (
        <div
          className="absolute left-3 top-3 z-[2] flex flex-wrap items-center gap-1.5"
          data-card-ribbon
        >
          <span className="pointer-events-none rounded-full border border-primary/40 bg-background/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-sm">
            Featured
          </span>
        </div>
      ) : null}

      {showAvailability ? (
        <div
          className="absolute right-3 top-3 z-[2]"
          data-card-availability
        >
          <span className="pointer-events-none rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
            {card.availabilityLabel}
          </span>
        </div>
      ) : null}

      {showName || showPrimary || showCity || hasMetaLine ? (
        <div
          className="absolute inset-x-0 bottom-0 z-[1] px-4 pb-4 sm:px-5 sm:pb-5"
          data-card-copy
        >
          {showName ? (
            <h3
              className="text-lg font-semibold leading-tight tracking-wide text-white drop-shadow-sm sm:text-xl"
              style={{
                fontFamily: "var(--site-heading-font, inherit)",
              }}
              data-card-name
              suppressHydrationWarning
            >
              {card.displayName}
            </h3>
          ) : null}
          {showPrimary || showCity ? (
            <p
              className="mt-1 truncate text-xs font-medium uppercase tracking-[0.14em] text-white/85 sm:text-[13px]"
              data-card-kicker
              suppressHydrationWarning
            >
              {showPrimary ? card.primaryTalentTypeLabel : null}
              {showPrimary && showCity ? (
                <span className="mx-1.5 text-white/45">·</span>
              ) : null}
              {showCity ? card.locationLabel : null}
            </p>
          ) : null}
          {hasMetaLine ? (
            <p
              className="mt-1.5 truncate text-[11px] text-white/65 sm:text-xs"
              data-card-meta
              suppressHydrationWarning
            >
              {showSecondary ? card.secondaryTalentTypeLabel : null}
              {showSecondary && languageLine ? (
                <span className="mx-1.5 text-white/35">·</span>
              ) : null}
              {languageLine}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  // No Request CTA → keep the exact prior whole-card <Link> (back-compat,
  // zero structural change for existing compositions).
  if (!requestCta) {
    return (
      <Link
        href={href}
        className={wrapClass}
        aria-label={card.displayName}
        data-card-variant={variant}
        data-card-chrome={cardChrome}
        data-card-image-treatment={imageTreatment}
        suppressHydrationWarning
      >
        {media}
      </Link>
    );
  }

  // With a Request CTA, avoid invalid nested-interactive: the media/name
  // block is the "View profile" link; Request is a sibling anchor. The
  // action row gets premium rhythm via `data-card-actions` + the shared
  // `site-prim-cta` button family (token-driven, reusable per tenant).
  return (
    <article
      className={wrapClass}
      data-card-variant={variant}
      data-card-chrome={cardChrome}
      data-card-image-treatment={imageTreatment}
      data-card-action-style={actionStyle}
      suppressHydrationWarning
    >
      <Link
        href={href}
        className="block"
        aria-label={`${viewProfileLabel}: ${card.displayName}`}
        suppressHydrationWarning
      >
        {media}
      </Link>
      <div
        className="flex items-stretch gap-2 p-3 sm:gap-2.5 sm:p-4"
        data-card-actions
        suppressHydrationWarning
      >
        <Link
          href={href}
          className="site-prim-cta site-prim-cta--outline site-prim-cta--sm flex-1 justify-center"
          suppressHydrationWarning
        >
          {viewProfileLabel}
        </Link>
        <a
          href={prefixPublicHref(requestCta.href, publicPathPrefix)}
          className="site-prim-cta site-prim-cta--primary site-prim-cta--sm flex-1 justify-center"
          suppressHydrationWarning
        >
          {requestCta.label}
        </a>
      </div>
    </article>
  );
}

export const FeaturedTalentCard = memo(FeaturedTalentCardInner);
