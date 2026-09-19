"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";

import { createTranslator } from "@/i18n/messages";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { TalentQuickViewButton } from "@/components/directory/talent-quick-view";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { formatPriceFromLabel } from "@/lib/directory/format-price-from";
import type { DirectoryCardDTO } from "@/lib/directory/types";
import {
  type CaptionNorms,
  isRedundant,
  NO_CAPTION_NORMS,
} from "@/lib/directory/caption-norms";

import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";
import {
  CardFactStrip,
  pickAttributeLines,
  pickFitLabels,
  TalentCardTraitRow,
  traitRowMode,
} from "@/components/talent-cards/talent-card-trait-row";

import { DirectoryCard } from "./DirectoryCard";
import {
  AVAILABILITY_UNKNOWN,
  AVAILABILITY_UNKNOWN_ES,
  type DirectoryCardData,
} from "./card-data";
import type { DirectoryV1 } from "./schema";

/**
 * Maps the legacy public `DirectoryCardDTO` (engine payload, what
 * `/api/directory` + `/api/ai/search` return) onto the canonical
 * `DirectoryCardData` shape the premium `<DirectoryCard>` expects, AND
 * wraps the card in a relative container that layers the shared
 * `<TalentCardActions>` affordances (favorite bookmark + inquiry-cart
 * toggle) over the card photo.
 *
 * The `<DirectoryCard>` itself stays pure / prop-driven (RP-1 / T2 reuse);
 * all interactivity lives in this adapter wrapper via `<TalentCardActions>`.
 * Both affordances sit in-media in the top-right cluster (favorite heart +
 * hover-revealed inquiry pill) and are gated on the section's `showSave` /
 * `showAddToInquiry` knobs (P4 — previously always-on). The trait row
 * (fit chips + catalog lines) is projected from the DTO and trimmed by
 * `cardFieldKeys` / `maxFieldLines`.
 */
export function DirectoryCardAdapter({
  card,
  cardStyle,
  cardAspect,
  show,
  nameFallback,
  showSave,
  showAddToInquiry,
  showQuickView = true,
  showPriceFrom = false,
  captionNorms = NO_CAPTION_NORMS,
  cardClickAction = "modal",
  locale = "en",
  cardFieldKeys,
  maxFieldLines,
  density = "comfortable",
  hoverBehavior = "reveal_traits",
  priority,
  index,
}: {
  card: DirectoryCardDTO;
  cardStyle: NonNullable<DirectoryV1["cardStyle"]>;
  cardAspect: NonNullable<DirectoryV1["cardAspect"]>;
  /**
   * RESOLVED line visibility — concrete booleans, never the raw optional
   * section props: the section value, else the tenant Card Design default,
   * else the platform default (see Component.tsx). Concrete here so a knob
   * can never silently read `undefined` as "off".
   */
  show: {
    showName: boolean;
    showTalentType: boolean;
    showLocation: boolean;
    showAvailability: boolean;
    showBadges: boolean;
    showAttributes: boolean;
  };
  nameFallback: DirectoryV1["nameFallback"];
  /** Render the favorite (save) affordance overlay. */
  showSave: boolean;
  /** Render the in-media hover-revealed "Inquire" cart pill over the card. */
  showAddToInquiry: boolean;
  /** Render the quick-view (eye) media-peek affordance over the card. */
  showQuickView?: boolean;
  /** Render the "From $X" starting-price line (cheapest public offering). */
  showPriceFrom?: boolean;
  /**
   * What is NORMAL for the grid this card sits in. Fields matching the norm
   * are dropped from THIS card so the caption only ever carries
   * differentiating information (see lib/directory/caption-norms).
   */
  captionNorms?: CaptionNorms;
  /**
   * "modal" (default): the card's soft navigation is intercepted by
   * @modal/(.)t and quick-opens the profile overlay. "page": force a hard
   * navigation so the canonical profile page renders instead.
   */
  cardClickAction?: DirectoryV1["cardClickAction"];
  /** Locale for quick-view copy + analytics. */
  locale?: string;
  /** Catalog-field allow-list + order; empty = catalog default order. */
  cardFieldKeys: DirectoryV1["cardFieldKeys"];
  /** Cap on the catalog trait lines under the chips. */
  maxFieldLines: DirectoryV1["maxFieldLines"];
  /** Grid density — threaded to the canonical card for compact captions. */
  density?: NonNullable<DirectoryV1["density"]>;
  /**
   * Hover behavior. `"reveal_traits"` (default) hides the trait row until the
   * card is hovered / focused; every other value keeps it statically visible.
   */
  hoverBehavior?: NonNullable<DirectoryV1["hoverBehavior"]>;
  priority?: boolean;
  index?: number;
}) {
  const pathname = usePathname();
  const mediaRef = useRef<HTMLDivElement>(null);
  const cart = useInquiryCart();
  const t = createTranslator(locale);

  const data = mapDtoToCardData(card, pathname);
  // hover:"swap" — give the canonical card its second photo. Only under swap
  // so the extra <Image> never mounts for the other hover modes.
  if (hoverBehavior === "swap" && card.hoverThumbUrl) {
    data.hoverPhotoUrl = card.hoverThumbUrl;
  }

  // Differential caption: a card only spends a line on location/availability
  // when it DIFFERS from the rest of the grid. On a roster where 40 of 43
  // cards read "Available from Jul 26", that line told the client nothing;
  // now it appears exactly where it means something. `show` stays the
  // operator's ceiling — this can only ever hide, never reveal.
  const effectiveShow = {
    ...show,
    showLocation:
      show.showLocation &&
      !isRedundant(data.location, captionNorms.dominantLocation),
    // Cinematic anchors its top-left corner on the availability pill, so
    // the "drop when it repeats the grid" rule would leave a hole there.
    showAvailability:
      show.showAvailability &&
      (cardStyle === "profile" ||
        !isRedundant(data.availabilityLabel, captionNorms.dominantAvailability)),
  };

  if (
    showPriceFrom &&
    typeof card.priceFromCents === "number" &&
    card.priceFromCents > 0
  ) {
    data.priceFromLabel = formatPriceFromLabel(
      card.priceFromCents,
      card.priceFromCurrency ?? "USD",
      locale,
    );
  }

  // STATE must stay visible; only ACTIONS may hide behind hover. When the
  // talent is in the visitor's lineup the pill (now reading "In lineup" ✓)
  // stays persistent on the resting card — previously the active state was
  // invisible until hover, which read as "nothing selected".
  const inLineup = cart.isReady && cart.isInCart(card.id);

  const style: "portrait" | "editorial" | "profile" =
    cardStyle === "editorial"
      ? "editorial"
      : cardStyle === "profile"
        ? "profile"
        : "portrait";

  const fitChips = pickFitLabels(data.fitLabels);
  // Cinematic's strip is a fixed three-column spec block, so it ignores the
  // line ceiling and takes the first three card-visible fields.
  const traitLines =
    style === "profile"
      ? pickAttributeLines(data.cardAttributes, cardFieldKeys, 3, 3)
      : pickAttributeLines(data.cardAttributes, cardFieldKeys, maxFieldLines);
  const cinematicRating =
    data.ratingAvg != null && meetsCredibilityFloor(data.ratingCount)
      ? { avg: data.ratingAvg, count: data.ratingCount ?? 0 }
      : null;

  // `reveal_traits` (the preset default) keeps the trait row out of the resting
  // card and reveals it on hover / focus, so the grid reads as clean portraits
  // until the visitor leans in. Every other hover mode (zoom / swap / none)
  // keeps the traits statically visible. On touch devices (no hover) the row
  // stays visible via `@media(hover:none)` so the traits are never unreachable,
  // and focus-within keeps it keyboard-accessible.
  const revealTraitsOnHover = hoverBehavior === "reveal_traits";

  // The trait row renders INSIDE the card caption (TalentCard `traitSlot`),
  // never as a loose line under the photo. On portrait the caption is an
  // absolute bottom-anchored block, so a hover reveal grows it upward and
  // the card's box never changes — a CSS-grid row can't reflow.
  const traitMode = traitRowMode({
    hasContent:
      show.showAttributes !== false &&
      (fitChips.length > 0 || traitLines.length > 0),
    revealOnHover: revealTraitsOnHover,
  });
  // Cinematic renders its facts as a ruled, always-visible strip (the card
  // is a fixed-height statement; a hover reveal has nowhere to grow).
  const traitSlot =
    style === "profile" ? (
      show.showAttributes !== false && (traitLines.length > 0 || cinematicRating) ? (
        <CardFactStrip
          fitChips={[]}
          traitLines={traitLines}
          tone="scrim"
          rating={cinematicRating}
        />
      ) : undefined
    ) : traitMode ? (
      <TalentCardTraitRow
        fitChips={fitChips}
        traitLines={traitLines}
        mode={traitMode}
        onScrim={style === "portrait"}
      />
    ) : undefined;

  // Persistent "Inquire" CTA, rendered IN the caption (via TalentCard's
  // `ctaSlot`) instead of the old hover-only icon pill over the photo — the
  // "Cinematic" and light-portrait Card Design kits both read this way: the
  // top-right cluster stays favorite + quick-view only, and Inquire becomes
  // an always-visible button next to the price. Reuses the exact same
  // `<TalentCardActions>` control (cart state, fly-to-rail animation,
  // "In lineup" state) — no duplicated inquiry logic.
  const ctaSlot =
    showAddToInquiry && (style === "profile" || style === "portrait") ? (
      <TalentCardActions
        talentProfileId={card.id}
        profileCode={card.profileCode ?? ""}
        displayName={card.displayName}
        sourcePage={pathname}
        variant="pill"
        hideFavorite
        portraitUrl={card.thumbnail?.url ?? null}
        locale={locale}
        getInquiryPhotoRect={() =>
          mediaRef.current?.querySelector("img")?.getBoundingClientRect() ??
          null
        }
      />
    ) : undefined;

  // cardClickAction="page" — defeat the route interception by turning the
  // card root's soft <Link> navigation into a hard load. Capture-phase so it
  // runs before Next's Link handler; overlay action buttons are siblings of
  // the root link, so closest() keeps them unaffected.
  const handleClickCapture =
    cardClickAction === "page" && data.profileHref
      ? (event: React.MouseEvent) => {
          const link = (event.target as HTMLElement).closest?.(
            "a.talent-card",
          );
          if (!link) return;
          // Every browser new-tab / save-link gesture must keep native
          // behavior: cmd/ctrl (new tab), shift (new window), alt
          // (save/download), middle button (new tab).
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(data.profileHref);
        }
      : undefined;

  return (
    <div
      className="@container group/cardwrap relative flex flex-col"
      data-directory-card
      onClickCapture={handleClickCapture}
    >
      <div className="relative" ref={mediaRef}>
        <DirectoryCard
          data={data}
          style={style}
          show={effectiveShow}
          nameFallback={nameFallback}
          aspect={cardAspect}
          density={density}
          priority={priority}
          index={index}
          traitSlot={traitSlot}
          ctaSlot={ctaSlot}
          badgeSlot={
            data.bookable ? (
              <span className="pointer-events-none absolute left-2.5 bottom-2.5 z-[2] rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/80 backdrop-blur-sm">
                {t("public.directory.card.booksByAppointment")}
              </span>
            ) : undefined
          }
          secondaryActionSlot={
            data.bookable && data.profileHref ? (
              // A <button>, not an <a> — this slot renders inside TalentCard's
              // own <Link> root (badgeSlot/secondaryActionSlot sit within it),
              // so a real anchor here is an invalid nested-<a>: the browser's
              // HTML parser silently repairs it on the initial load, and
              // React's hydration then mismatches against that repaired DOM.
              // Reserve targets the exact same profile as the card itself, so
              // a plain click/keyboard activation just does that navigation
              // directly; modifier/middle clicks still open a new tab, same
              // as a real link would. (The card root is a <Link> — keep this
              // local, matching TalentQuickViewButton's handleOpen above.)
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    window.open(data.profileHref, "_blank", "noopener,noreferrer");
                    return;
                  }
                  window.location.assign(data.profileHref);
                }}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  event.stopPropagation();
                  window.open(data.profileHref, "_blank", "noopener,noreferrer");
                }}
                className="pointer-events-auto rounded-full border border-border bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground backdrop-blur-sm"
              >
                {t("public.directory.card.reserve")}
              </button>
            ) : undefined
          }
        />
        {/* Top-right affordance cluster: the favorite heart (always visible),
            a quick-view eye, and — ONLY on styles without a persistent
            `ctaSlot` (editorial) — a hover-revealed gold "Inquire" pill.
            Portrait + Cinematic (profile) render Inquire as the persistent
            caption CTA instead (`ctaSlot`, above), so this cluster stays
            favorite + quick-view only for them. It carries the portrait +
            photo rect so adding flies a face-focus avatar to the
            "Message {agency}" launcher pill (plan §4.A.5). */}
        {/* Lineup STATE badge — top-left, always visible while active, for
            styles WITHOUT a persistent ctaSlot (the ctaSlot itself already
            shows the checked "In lineup" state, so this would just
            duplicate it on portrait/profile). A compact gold check; hover
            reveals the label, click removes (the shared TalentCardActions
            keeps the Undo-flash + fly animation behavior single-source).
            Styled via .lineup-check-badge in talent-card-actions.css. */}
        {showAddToInquiry && inLineup && !ctaSlot ? (
          <div
            className="lineup-check-badge absolute left-2.5 top-2.5 z-[2]"
            title={locale === "es" ? "En tu lineup, clic para quitar" : "In lineup, click to remove"}
          >
            <TalentCardActions
              talentProfileId={card.id}
              profileCode={card.profileCode ?? ""}
              displayName={card.displayName}
              // Same optimistic-portrait handoff as the featured section: this
              // arm shows the inquiry button, so an add lands in the lineup.
              portraitUrl={card.thumbnail?.url ?? null}
              sourcePage={pathname}
              variant="compact"
              hideFavorite
              locale={locale}
            />
          </div>
        ) : null}
        {showSave || showAddToInquiry || showQuickView ? (
          <div className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-2">
            {showAddToInquiry && !inLineup && !ctaSlot ? (
              <div className="pointer-events-none translate-x-1 opacity-0 transition-all duration-200 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:opacity-100 group-hover/cardwrap:pointer-events-auto group-hover/cardwrap:translate-x-0 group-hover/cardwrap:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-x-0 [@media(hover:none)]:opacity-100">
                <TalentCardActions
                  talentProfileId={card.id}
                  profileCode={card.profileCode ?? ""}
                  displayName={card.displayName}
                  sourcePage={pathname}
                  variant="pill"
                  hideFavorite
                  portraitUrl={card.thumbnail?.url ?? null}
                  getInquiryPhotoRect={() =>
                    mediaRef.current
                      ?.querySelector("img")
                      ?.getBoundingClientRect() ?? null
                  }
                />
              </div>
            ) : null}
            {showQuickView && data.profileHref ? (
              <div>
                <TalentQuickViewButton
                  talentProfileId={card.id}
                  profileCode={card.profileCode ?? ""}
                  displayName={card.displayName}
                  profileHref={data.profileHref}
                  thumbnailUrl={card.thumbnail?.url ?? null}
                  locale={locale}
                  sourcePage={pathname}
                  openLabel={locale === "es" ? "Vista rápida" : "Quick view"}
                  closeLabel={locale === "es" ? "Cerrar" : "Close"}
                  viewProfileLabel={
                    locale === "es" ? "Ver perfil" : "View profile"
                  }
                />
              </div>
            ) : null}
            {showSave ? (
              <TalentCardActions
                talentProfileId={card.id}
                profileCode={card.profileCode ?? ""}
                displayName={card.displayName}
                sourcePage={pathname}
                variant="compact"
                hideInquiry
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function mapDtoToCardData(
  card: DirectoryCardDTO,
  pathname: string,
): DirectoryCardData {
  const profileHref = card.profileCode
    ? clientLocaleHref(pathname, `/t/${encodeURIComponent(card.profileCode)}`)
    : "";

  const availability = formatAvailability(
    card,
    stripLocaleFromPathname(pathname).locale,
  );

  return {
    id: card.id,
    name: card.displayName,
    profileCode: card.profileCode || null,
    profileHref,
    primaryType: card.primaryTalentTypeLabel || null,
    location: card.locationLabel || null,
    photoUrl: card.thumbnail?.url ?? null,
    agencyName: card.agencyName ?? null,
    isExclusive: Boolean(card.isExclusive),
    availabilityLabel: availability.label,
    availabilityKnown: availability.known,
    availableDaysInNext30: card.availableDaysInNext30 ?? null,
    fitLabels: card.fitLabels,
    cardAttributes: card.cardAttributes,
    ratingAvg: card.ratingAvg ?? null,
    ratingCount: card.ratingCount ?? null,
    wouldBookAgainPct: card.wouldBookAgainPct ?? null,
    bookable: card.bookable === true,
    verified: card.verified === true,
    verifiedLines: card.verifiedLines,
  };
}

/**
 * Availability caption. `locale` was previously hardcoded to "en" for BOTH the
 * date format and the surrounding words, so a Spanish storefront card read
 * "Available from Aug 21". Defaults to "en" so every existing call site keeps
 * its current output; callers that know the active locale pass it.
 */
export function formatAvailability(
  card: DirectoryCardDTO,
  locale: string = "en",
): {
  label: string;
  known: boolean;
} {
  const isEs = locale === "es";
  if (card.nextAvailableDate) {
    const d = new Date(`${card.nextAvailableDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const when = d.toLocaleDateString(isEs ? "es" : "en", {
        month: "short",
        day: "numeric",
      });
      return {
        label: isEs ? `Disponible desde el ${when}` : `Available from ${when}`,
        known: true,
      };
    }
  }
  if (
    typeof card.availableDaysInNext30 === "number" &&
    card.availableDaysInNext30 > 0
  ) {
    return {
      label: isEs
        ? `Disponible ${card.availableDaysInNext30} días en los próximos 30`
        : `Available ${card.availableDaysInNext30} days in next 30`,
      known: true,
    };
  }
  return {
    label: isEs ? AVAILABILITY_UNKNOWN_ES : AVAILABILITY_UNKNOWN,
    known: false,
  };
}

