/**
 * Presentational server-rendered card for the featured_talent section.
 *
 * Why not reuse `<TalentCard />` from /directory?
 *   - That component is a client component with save / share / inquiry /
 *     quick-preview interactivity that the homepage surface doesn't need.
 *   - The homepage featured grid is a showcase — cards link straight to
 *     the profile page and inherit the Editorial Bridal card family CSS
 *     via the same `talent-card` class and `data-card-*` attribute hooks.
 *   - Going server-only here keeps the homepage zero-client-JS for this
 *     slot and avoids pulling the full discovery state context into a
 *     surface that doesn't need it.
 *
 * Visual parity with directory cards comes from:
 *   - className `talent-card` (targeted by directory card family rules in
 *     `token-presets.css`).
 *   - `data-card-media` / `data-card-ribbon` / `data-card-name` /
 *     `data-card-kicker` / `data-card-body` / `data-card-chip` hooks.
 */
import Image from "next/image";
import Link from "next/link";

import type { FeaturedTalentCardDTO } from "./fetch";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";

function profileHref(card: FeaturedTalentCardDTO): string {
  const code = encodeURIComponent(card.profileCode);
  return card.slugPart
    ? `/t/${code}-${encodeURIComponent(card.slugPart)}`
    : `/t/${code}`;
}

/**
 * P1-2 — optional render controls (all default to "show", so existing
 * callers/compositions are visually unchanged). Fields not present on the
 * cache-trimmed `FeaturedTalentCardDTO` (secondary type, languages,
 * availability, parent-vs-leaf category) are intentionally NOT invented
 * here — see the talent_collection report's documented DTO-extension
 * follow-on. `parentCategoryDisplay` therefore gracefully falls back to the
 * primary type label until the DTO carries taxonomy hierarchy.
 */
export interface FeaturedTalentCardDisplay {
  showName?: boolean;
  showPrimaryType?: boolean;
  showCity?: boolean;
  showBadge?: boolean;
  /** Reserved — DTO has no parent-category yet; falls back to primary type. */
  parentCategoryDisplay?: boolean;
  cardVariant?: "editorial" | "compact" | "minimal" | "profile";
}

export function FeaturedTalentCard({
  card,
  priority,
  publicPathPrefix = "",
  display,
  requestCta,
}: {
  card: FeaturedTalentCardDTO;
  /** First row can opt into Next/Image priority for LCP. */
  priority?: boolean;
  publicPathPrefix?: string;
  display?: FeaturedTalentCardDisplay;
  /** Optional per-card Request/add-to-inquiry CTA. */
  requestCta?: { label: string; href: string } | null;
}) {
  const href = prefixPublicHref(profileHref(card), publicPathPrefix);
  const showName = display?.showName !== false;
  const showPrimary = display?.showPrimaryType !== false;
  const showCity = display?.showCity !== false;
  const showBadge = display?.showBadge !== false && card.isFeatured;
  const variant = display?.cardVariant ?? "editorial";
  const wrapClass =
    "talent-card site-featured-talent__card group/card flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-lg";

  const media = (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden"
      data-card-media
    >
      {card.thumbnailUrl ? (
        <Image
          src={card.thumbnailUrl}
          alt={card.displayName}
          fill
          className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
        />
      ) : (
        <div
          className="flex h-full min-h-[200px] items-center justify-center bg-muted text-xs tracking-[0.25em] text-muted-foreground"
          aria-hidden
        >
          {card.displayName
            .split(/\s+/)
            .map((w) => w[0]?.toUpperCase())
            .filter(Boolean)
            .slice(0, 2)
            .join("")}
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
        aria-hidden
      />

      {showBadge ? (
        <div
          className="absolute left-2 top-2 z-[1] flex flex-wrap items-center gap-1.5"
          data-card-ribbon
        >
          <span className="pointer-events-none rounded-full border border-primary/40 bg-background/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-sm">
            Featured
          </span>
        </div>
      ) : null}

      {showName || showPrimary || showCity ? (
        <div className="absolute inset-x-0 bottom-0 z-[1] px-3 pb-3 sm:px-4 sm:pb-4">
          {showName ? (
            <h3
              className="text-base font-semibold leading-tight tracking-wide text-white drop-shadow-sm sm:text-lg"
              style={{
                fontFamily: "var(--site-heading-font, var(--font-display))",
              }}
              data-card-name
            >
              {card.displayName}
            </h3>
          ) : null}
          {showPrimary || showCity ? (
            <p
              className="mt-0.5 truncate text-xs text-white/80 sm:text-sm"
              data-card-kicker
            >
              {showPrimary ? card.primaryTalentTypeLabel : null}
              {showPrimary && showCity && card.locationLabel ? (
                <span className="mx-1 text-white/50">·</span>
              ) : null}
              {showCity ? card.locationLabel : null}
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
      >
        {media}
      </Link>
    );
  }

  // With a Request CTA, avoid invalid nested-interactive: the media/name
  // block is the "View profile" link; Request is a sibling anchor.
  return (
    <article className={wrapClass} data-card-variant={variant}>
      <Link
        href={href}
        className="block"
        aria-label={`View ${card.displayName}`}
      >
        {media}
      </Link>
      <div className="flex gap-2 p-3 sm:p-4">
        <Link
          href={href}
          className="site-prim-cta site-prim-cta--outline site-prim-cta--sm flex-1 justify-center"
        >
          View profile
        </Link>
        <a
          href={prefixPublicHref(requestCta.href, publicPathPrefix)}
          className="site-prim-cta site-prim-cta--primary site-prim-cta--sm flex-1 justify-center"
        >
          {requestCta.label}
        </a>
      </div>
    </article>
  );
}
