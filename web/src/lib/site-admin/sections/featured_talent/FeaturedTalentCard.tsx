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

function profileHref(card: FeaturedTalentCardDTO): string {
  const code = encodeURIComponent(card.profileCode);
  return card.slugPart
    ? `/t/${code}-${encodeURIComponent(card.slugPart)}`
    : `/t/${code}`;
}

export function FeaturedTalentCard({
  card,
  priority,
}: {
  card: FeaturedTalentCardDTO;
  /** First row can opt into Next/Image priority for LCP. */
  priority?: boolean;
}) {
  const href = profileHref(card);
  return (
    <Link
      href={href}
      className="talent-card site-featured-talent__card group/card flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/95 to-black shadow-sm transition-shadow duration-200 hover:shadow-lg hover:shadow-[var(--impronta-gold)]/10"
      aria-label={card.displayName}
    >
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
            className="flex h-full min-h-[200px] items-center justify-center bg-gradient-to-b from-zinc-800/90 to-zinc-950 text-xs tracking-[0.25em] text-white/40"
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

        {card.isFeatured ? (
          <div
            className="absolute left-2 top-2 z-[1] flex flex-wrap items-center gap-1.5"
            data-card-ribbon
          >
            <span className="pointer-events-none rounded-full border border-[var(--impronta-gold)]/30 bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--impronta-gold)] backdrop-blur-sm">
              Featured
            </span>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-[1] px-3 pb-3 sm:px-4 sm:pb-4">
          <h3
            className="font-[family-name:var(--font-cinzel)] text-base font-semibold leading-tight tracking-wide text-white drop-shadow-sm sm:text-lg"
            data-card-name
          >
            {card.displayName}
          </h3>
          <p
            className="mt-0.5 truncate text-xs text-white/80 sm:text-sm"
            data-card-kicker
          >
            {card.primaryTalentTypeLabel}
            {card.locationLabel ? (
              <>
                <span className="mx-1 text-[var(--impronta-gold)]/60">·</span>
                {card.locationLabel}
              </>
            ) : null}
          </p>
        </div>
      </div>
    </Link>
  );
}
