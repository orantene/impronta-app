"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";

import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { TalentQuickViewButton } from "@/components/directory/talent-quick-view";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { formatPriceFromLabel } from "@/lib/directory/format-price-from";
import type { DirectoryCardDTO } from "@/lib/directory/types";
import {
  type CaptionNorms,
  isRedundant,
  NO_CAPTION_NORMS,
} from "@/lib/directory/caption-norms";

import { DirectoryCard } from "./DirectoryCard";
import {
  AVAILABILITY_UNKNOWN,
  type DirectoryCardAttribute,
  type DirectoryCardData,
  type DirectoryCardFitLabel,
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
  show: Pick<
    DirectoryV1,
    | "showName"
    | "showTalentType"
    | "showLocation"
    | "showAvailability"
    | "showBadges"
    | "showAttributes"
  >;
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
    showAvailability:
      show.showAvailability &&
      !isRedundant(data.availabilityLabel, captionNorms.dominantAvailability),
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

  const style: "portrait" | "editorial" =
    cardStyle === "editorial" ? "editorial" : "portrait";

  const fitChips = pickFitLabels(data.fitLabels);
  const traitLines = pickAttributeLines(
    data.cardAttributes,
    cardFieldKeys,
    maxFieldLines,
  );

  // `reveal_traits` (the preset default) keeps the trait row out of the resting
  // card and reveals it on hover / focus, so the grid reads as clean portraits
  // until the visitor leans in. Every other hover mode (zoom / swap / none)
  // keeps the traits statically visible. On touch devices (no hover) the row
  // stays visible via `@media(hover:none)` so the traits are never unreachable,
  // and focus-within keeps it keyboard-accessible.
  const revealTraitsOnHover = hoverBehavior === "reveal_traits";

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
      className="group/cardwrap relative flex flex-col"
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
        />
        {/* Top-right affordance cluster: the favorite heart (always visible)
            and a hover-revealed gold "Inquire" pill. This in-media pill is the
            single inquiry affordance per card (it replaces the old heavy
            full-width "Inquire / Added" bar that used to sit under every card).
            It carries the portrait + photo rect so adding flies a face-focus
            avatar to the "Message {agency}" launcher pill (plan §4.A.5), and it
            reflects cart membership as "In lineup" with a filled pill. On touch
            devices (no hover) the pill stays visible so the action is never
            hidden; on desktop it fades in on card hover / focus. */}
        {/* Lineup STATE badge — top-left, always visible while active. A
            compact gold check; hover reveals the label, click removes (the
            shared TalentCardActions keeps the Undo-flash + fly animation
            behavior single-source). Styled via .lineup-check-badge in
            talent-card-actions.css. */}
        {showAddToInquiry && inLineup ? (
          <div
            className="lineup-check-badge absolute left-2.5 top-2.5 z-[2]"
            title={locale === "es" ? "En tu lineup — quitar" : "In lineup — click to remove"}
          >
            <TalentCardActions
              talentProfileId={card.id}
              profileCode={card.profileCode ?? ""}
              displayName={card.displayName}
              sourcePage={pathname}
              variant="compact"
              hideFavorite
              locale={locale}
            />
          </div>
        ) : null}
        {showSave || showAddToInquiry || showQuickView ? (
          <div className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-2">
            {showAddToInquiry && !inLineup ? (
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

      {/* Restrained editorial trait row: a couple of fit chips + a couple of
          catalog lines. Tagged with `data-card-chip` so a card kit can
          restyle it. Renders nothing when the DTO carries no trait data or
          the section turned "Show attributes" off (the previously-dead
          `showAttributes` knob now gates this row).
          With `reveal_traits` (the preset default) the row is collapsed at
          rest and reveals on hover / focus / touch; every other hover mode
          keeps it statically visible. */}
      {show.showAttributes !== false &&
      (fitChips.length > 0 || traitLines.length > 0) ? (
        revealTraitsOnHover ? (
          // Collapsed at rest (0-fr grid row + faded), revealed on
          // group-hover / focus-within / touch. The grid-rows transition
          // avoids a hard layout jump; the inner overflow-hidden clips the
          // row while it is collapsed.
          <div
            className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity,margin] duration-200 group-hover/cardwrap:mt-2 group-hover/cardwrap:grid-rows-[1fr] group-hover/cardwrap:opacity-100 group-focus-within/cardwrap:mt-2 group-focus-within/cardwrap:grid-rows-[1fr] group-focus-within/cardwrap:opacity-100 [@media(hover:none)]:mt-2 [@media(hover:none)]:grid-rows-[1fr] [@media(hover:none)]:opacity-100"
            data-card-traits=""
          >
            <div className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
              <TraitRowBody fitChips={fitChips} traitLines={traitLines} />
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5" data-card-traits="">
            <TraitRowBody fitChips={fitChips} traitLines={traitLines} />
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * The trait-row inner content (fit chips + catalog lines), shared by the
 * static and hover-reveal wrappers so the markup stays single-source. The
 * `data-card-chip` / `data-card-trait-line` hooks let a card kit restyle it.
 */
function TraitRowBody({
  fitChips,
  traitLines,
}: {
  fitChips: DirectoryCardFitLabel[];
  traitLines: DirectoryCardAttribute[];
}) {
  return (
    <>
      {fitChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {fitChips.map((chip) => (
            <span
              key={chip.slug}
              data-card-chip
              className="inline-flex max-w-full items-center truncate rounded-full border border-border px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]"
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      {traitLines.length > 0 ? (
        <dl className="flex flex-col gap-0.5">
          {traitLines.map((trait) => (
            <div
              key={trait.key}
              data-card-trait-line=""
              className="flex items-baseline gap-1.5 text-[11px] leading-snug"
            >
              <dt className="shrink-0 uppercase tracking-[0.12em] text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]">
                {trait.label}
              </dt>
              <dd className="min-w-0 truncate text-foreground/80">
                {trait.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}

/** At most two fit chips — a restrained, editorial trait row. */
function pickFitLabels(
  fitLabels: readonly DirectoryCardFitLabel[] | undefined,
): DirectoryCardFitLabel[] {
  if (!fitLabels || fitLabels.length === 0) return [];
  return fitLabels.filter((f) => f.label.trim().length > 0).slice(0, 2);
}

/**
 * At most two catalog trait lines, ordered + filtered by the section's
 * `cardFieldKeys` allow-list when set, else the DTO's catalog order. The
 * 2-line ceiling is intersected with the operator's `maxFieldLines` knob.
 */
function pickAttributeLines(
  attributes: readonly DirectoryCardAttribute[] | undefined,
  cardFieldKeys: DirectoryV1["cardFieldKeys"],
  maxFieldLines: DirectoryV1["maxFieldLines"],
): DirectoryCardAttribute[] {
  if (!attributes || attributes.length === 0) return [];
  const usable = attributes.filter((a) => a.value.trim().length > 0);

  let ordered: DirectoryCardAttribute[];
  if (cardFieldKeys.length > 0) {
    const byKey = new Map(usable.map((a) => [a.key, a] as const));
    ordered = cardFieldKeys
      .map((key) => byKey.get(key))
      .filter((a): a is DirectoryCardAttribute => Boolean(a));
  } else {
    ordered = usable;
  }

  // Keep the row restrained (<=2 lines) but never exceed the operator's cap.
  const cap = Math.max(0, Math.min(2, maxFieldLines));
  return ordered.slice(0, cap);
}

function mapDtoToCardData(
  card: DirectoryCardDTO,
  pathname: string,
): DirectoryCardData {
  const profileHref = card.profileCode
    ? clientLocaleHref(pathname, `/t/${encodeURIComponent(card.profileCode)}`)
    : "";

  const availability = formatAvailability(card);

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
  };
}

export function formatAvailability(card: DirectoryCardDTO): {
  label: string;
  known: boolean;
} {
  if (card.nextAvailableDate) {
    const d = new Date(`${card.nextAvailableDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const when = d.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      });
      return { label: `Available from ${when}`, known: true };
    }
  }
  if (
    typeof card.availableDaysInNext30 === "number" &&
    card.availableDaysInNext30 > 0
  ) {
    return {
      label: `Available ${card.availableDaysInNext30} days in next 30`,
      known: true,
    };
  }
  return { label: AVAILABILITY_UNKNOWN, known: false };
}

