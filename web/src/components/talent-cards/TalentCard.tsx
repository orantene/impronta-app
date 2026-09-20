import { VerifiedMark } from "@/components/talent-cards/verified-mark";
import type { CSSProperties, ElementType, KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";

import { StaticStars } from "@/components/reviews/star-rating";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";

import {
  TALENT_CARD_ASPECT_RATIO,
  TALENT_CARD_CLASS,
  TALENT_CARD_VARS,
  type CanonicalTalentCardData,
  type TalentCardNameFallback,
  type TalentCardProps,
  type TalentCardRootMode,
} from "./talent-card-shape";
import {
  AgencyLine,
  AvailabilityLine,
  OwnershipBadge,
  StandingChip,
  VerifiedBadge,
} from "./talent-card-parts";
import { TalentCardEmptyPlate } from "./talent-card-empty-plate";

/**
 * Canonical talent card — the SINGLE card every directory / featured surface
 * renders. The old per-surface forks (the section card, the legacy /directory
 * grid card, the featured cards, the marketing card) collapse onto this one.
 *
 * PURE & PROP-DRIVEN by design (no "use client", no router hooks, no discovery
 * context, no module state) so the same component also powers the talent-dash
 * "how my card looks" preview AND the admin Card Design live preview.
 *
 * THE KEYSTONE: it emits `className="talent-card"` + the full `data-card-*`
 * hook set, and reads its colors from the cascade card-token chain
 * (`--token-card-*` → `--token-color-*` fallback). So a tenant publishing a
 * Card Design (P2) or applying the editorial-noir kit (P3) repaints every card
 * with ZERO per-card edits. Portrait + Editorial are the two live renders; the
 * other schema styles fall through to portrait until their kits land.
 */

function resolveName(
  name: string,
  show: boolean,
  fallback: TalentCardNameFallback,
): string | null {
  if (show) return name;
  if (fallback === "hidden") return null;
  if (fallback === "first_name") return name.split(/\s+/)[0] || null;
  return name; // code/role unavailable on card data → safe to show name
}

function Photo({
  data,
  aspectRatio,
  priority,
  rounded,
}: {
  data: CanonicalTalentCardData;
  aspectRatio: string;
  priority?: boolean;
  rounded: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${rounded}`}
      style={{ aspectRatio, backgroundColor: TALENT_CARD_VARS.surface }}
      data-card-media
    >
      {data.photoUrl ? (
        <>
          <Image
            src={data.photoUrl}
            alt={data.name}
            fill
            className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
          />
          {data.hoverPhotoUrl ? (
            // hover:"swap" — a second photo crossfaded in on hover. Lazy by
            // nature (opacity 0 until hover) and skipped entirely when the
            // surface doesn't provide one.
            <Image
              src={data.hoverPhotoUrl}
              alt=""
              aria-hidden
              fill
              className="object-cover opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              data-card-hover-photo
            />
          ) : null}
        </>
      ) : (
        // No-photo state — J9, built to the Creative Direction canvas. Replaces
        // a line-art silhouette that sat on `--token-card-surface`; on the noir
        // tenant that token is near-black, so the card read as a failed image
        // load rather than as a talent without a photograph. Rule 04 of the
        // canvas rules out a silhouette explicitly, alongside monograms,
        // initials and icons — all four read as placeholder.
        <TalentCardEmptyPlate discipline={data.primaryType} />
      )}
    </div>
  );
}

/**
 * Activation key handler for `rootMode="button"` — Enter / Space fire the
 * handler (matching native button semantics) without scrolling the page.
 */
function onActivateKeyDown(
  handler: (() => void) | undefined,
): ((e: KeyboardEvent) => void) | undefined {
  if (!handler) return undefined;
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}

/**
 * Common root props shared by both render branches. `rootMode="button"` adds
 * the `role="button"` + activation handlers a `<div>` root needs; `"link"`
 * adds the `href`. The keystone `className` + the literal `data-card-style`
 * attribute are written at each call site (so the source-text keystone guard
 * stays green); this only assembles the behavior + style props.
 */
function cardRootProps(
  rootMode: TalentCardRootMode,
  href: string,
  onActivate: (() => void) | undefined,
  style: CSSProperties | undefined,
):
  | {
      role: "button";
      tabIndex: 0;
      onClick: (() => void) | undefined;
      onKeyDown: ((e: KeyboardEvent) => void) | undefined;
      style: CSSProperties | undefined;
    }
  | { href: string; style: CSSProperties | undefined } {
  if (rootMode === "button") {
    return {
      role: "button",
      tabIndex: 0,
      onClick: onActivate,
      onKeyDown: onActivateKeyDown(onActivate),
      style,
    };
  }
  return { href, style };
}

export function TalentCard({
  data,
  style,
  show,
  nameFallback,
  aspect,
  priority,
  index,
  density = "comfortable",
  rootMode = "link",
  onActivate,
  cssVars,
  availabilitySlot,
  secondaryActionSlot,
  badgeSlot,
  traitSlot,
  ctaSlot,
  showAgencyLine = false,
  showStanding = "auto",
}: TalentCardProps) {
  const displayName = resolveName(data.name, show.showName, nameFallback);
  const href = data.profileHref || "#";
  const aspectRatio = TALENT_CARD_ASPECT_RATIO[aspect];
  const compact = density === "compact";
  // Inline per-tenant card palette (cross-tenant surfaces) merged onto the
  // root style. Undefined → no inline vars, card inherits the theme cascade.
  const rootStyle: CSSProperties | undefined = cssVars as
    | CSSProperties
    | undefined;

  // Root element: a navigating `<Link>` (default) or an in-place
  // `role="button"` div (Discover drawer). The literal `data-card-style`
  // attribute is written on each branch's root below so the source-text
  // keystone guard stays green.
  const Root: ElementType = rootMode === "button" ? "div" : Link;
  const rootProps = cardRootProps(rootMode, href, onActivate, rootStyle);

  if (style === "showcase") {
    // "Showcase" — the light dossier card: trust marks on the photo
    // (Verified, availability, Exclusive), then a raised white panel with
    // name + rating, a 3-fact strip, fit chips, and price + a persistent
    // Inquire CTA. Built for the cross-tenant hub grid (tulala.digital).
    const hasRating =
      data.ratingAvg != null && meetsCredibilityFloor(data.ratingCount);
    const typeLine = [
      show.showTalentType ? data.primaryType : null,
      show.showLocation ? data.location : null,
    ].filter(Boolean);
    return (
      <Root
        {...rootProps}
        data-card-style="showcase"
        className={`${TALENT_CARD_CLASS} @container group/card flex flex-col overflow-hidden rounded-2xl @[280px]:rounded-[20px] border border-[var(--token-card-border,#e7e3da)] bg-[var(--token-card-surface,#ffffff)] text-[var(--token-card-name-color,#17160f)] shadow-[0_1px_2px_rgba(23,22,15,0.06)] outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(23,22,15,0.55)] focus-visible:ring-2 focus-visible:ring-foreground/30 ${
          rootMode === "button" ? "cursor-pointer" : ""
        }`}
      >
        <div className="relative">
          <Photo
            data={data}
            aspectRatio={aspectRatio}
            priority={priority}
            rounded="rounded-none"
          />
          {data.verified ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[1]">
              <VerifiedBadge tone="light" />
            </div>
          ) : null}
          {badgeSlot ? (
            <div className="pointer-events-none absolute inset-0 z-[1]">
              {badgeSlot}
            </div>
          ) : null}
          {secondaryActionSlot ? (
            <div className="absolute right-3 top-3 z-[2]">
              {secondaryActionSlot}
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1] flex items-end justify-between gap-2">
            {availabilitySlot ??
              (show.showAvailability ? (
                <span
                  data-card-availability
                  className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-white/[0.92] px-2.5 py-1 text-[11px] font-medium text-[#17160f] shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
                >
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${
                      data.availabilityKnown
                        ? "bg-[#2e9e5b] shadow-[0_0_0_3px_rgba(46,158,91,0.22)]"
                        : "bg-[#9a968c]"
                    }`}
                  />
                  <span className="truncate">{data.availabilityLabel}</span>
                </span>
              ) : (
                <span />
              ))}
            {show.showBadges && data.isExclusive ? (
              <span
                data-card-badge-exclusive
                className="inline-flex shrink-0 items-center rounded-full bg-[var(--token-card-cta,#1f4d3a)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white"
              >
                Exclusive
              </span>
            ) : null}
          </div>
        </div>
        <div
          data-card-body
          className={`flex flex-col gap-2 px-3 pb-3 pt-2.5 @[240px]:gap-2.5 ${
            compact ? "@[240px]:px-3.5 @[240px]:pb-3.5 @[240px]:pt-3" : "@[240px]:px-4 @[240px]:pb-4 @[240px]:pt-3.5"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            {displayName ? (
              <h3
                data-card-name
                className={`min-w-0 truncate font-[family-name:var(--font-fraunces,Georgia,serif)] font-medium leading-[1.1] tracking-[-0.01em] ${
                  compact ? "text-base! @[240px]:text-lg!" : "text-lg! @[240px]:text-[22px]!"
                }`}
              >
                {displayName}
              </h3>
            ) : null}
            {hasRating ? (
              <span
                data-card-standing-shown
                className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold"
              >
                <StaticStars rating={data.ratingAvg ?? 0} size={12} />
                <span className="tabular-nums">{data.ratingAvg?.toFixed(1)}</span>
                <span
                  className="tabular-nums font-medium"
                  style={{ color: TALENT_CARD_VARS.muted }}
                >
                  · {data.ratingCount}
                </span>
              </span>
            ) : null}
          </div>
          {typeLine.length > 0 ? (
            <p
              className="-mt-1.5 truncate text-[13px]"
              style={{ color: TALENT_CARD_VARS.muted }}
            >
              {typeLine.join(" · ")}
            </p>
          ) : null}
          {traitSlot ? <div className="hidden @[200px]:contents">{traitSlot}</div> : null}
          <div className="flex items-center justify-between gap-2 pt-0.5 @[240px]:gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              {data.priceFromLabel ? (
                <span
                  data-card-price-from
                  className="truncate text-[15px] font-semibold tabular-nums text-[var(--token-card-price-color,#17160f)]"
                >
                  {data.priceFromLabel}
                  {data.priceFromUnitLabel ? (
                    <span
                      data-card-price-unit
                      className="ml-1 text-[11px] font-medium text-[var(--token-card-muted,#6a665c)]"
                    >
                      {data.priceFromUnitLabel}
                    </span>
                  ) : null}
                </span>
              ) : null}
              {showAgencyLine ? <AgencyLine data={data} onScrim={false} /> : null}
              {show.showBadges && !data.isExclusive ? (
                <OwnershipBadge data={data} />
              ) : null}
            </div>
            {ctaSlot ? <div className="shrink-0">{ctaSlot}</div> : null}
          </div>
        </div>
      </Root>
    );
  }

  if (style === "editorial") {
    return (
      <Root
        {...rootProps}
        data-card-style="editorial"
        className={`${TALENT_CARD_CLASS} group/card flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 ${
          rootMode === "button" ? "cursor-pointer" : ""
        }`}
      >
        {badgeSlot || secondaryActionSlot ? (
          <div className="relative">
            <Photo
              data={data}
              aspectRatio={aspectRatio}
              priority={priority}
              rounded="rounded-xl"
            />
            {badgeSlot ? (
              <div className="pointer-events-none absolute inset-0 z-[1]">
                {badgeSlot}
              </div>
            ) : null}
            {secondaryActionSlot ? (
              <div className="absolute right-2.5 top-2.5 z-[2]">
                {secondaryActionSlot}
              </div>
            ) : null}
          </div>
        ) : (
          <Photo
            data={data}
            aspectRatio={aspectRatio}
            priority={priority}
            rounded="rounded-xl"
          />
        )}
        <div
          className={`flex flex-col gap-1 border-t border-border ${
            compact ? "pt-2.5" : "pt-3"
          }`}
          data-card-body
        >
          <div className="flex items-baseline gap-3">
            {typeof index === "number" ? (
              <span
                className="font-display text-xs tabular-nums"
                style={{ color: TALENT_CARD_VARS.muted }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
            ) : null}
            {displayName ? (
              <h3
                data-card-name
                className={`font-display font-medium leading-tight tracking-wide ${
                  compact ? "text-base" : "text-lg"
                }`}
                style={{ color: TALENT_CARD_VARS.name }}
              >
                {displayName}
              </h3>
            ) : null}
            {/* The mark sits beside the name, where a visitor reads WHO this is
                — not in a corner with the save and share affordances, which is
                where a decoration would go. */}
            {data.verified && data.verifiedLines?.length ? (
              <VerifiedMark lines={data.verifiedLines} compact={compact} />
            ) : null}
          </div>
          {show.showTalentType && data.primaryType ? (
            <p
              className="text-[11px] font-medium uppercase tracking-[0.16em]"
              style={{ color: TALENT_CARD_VARS.muted }}
            >
              {data.primaryType}
              {show.showLocation && data.location ? (
                <span className="normal-case tracking-normal">
                  {"  ·  "}
                  {data.location}
                </span>
              ) : null}
            </p>
          ) : show.showLocation && data.location ? (
            <p className="text-xs" style={{ color: TALENT_CARD_VARS.muted }}>
              {data.location}
            </p>
          ) : null}
          {traitSlot}
          <StandingChip data={data} onScrim={false} showStanding={showStanding} />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            {show.showBadges ? <OwnershipBadge data={data} /> : <span />}
            {/* availabilitySlot overrides the built-in line so a richer surface
                (the Discover 14-day strip) can render in its place. */}
            {availabilitySlot ??
              (show.showAvailability ? <AvailabilityLine data={data} /> : null)}
          </div>
          {data.priceFromLabel ? (
            <p
              data-card-price-from
              // One token for both branches; the previous per-branch value is
              // the fallback, so an unset tenant renders exactly as before.
              className="mt-1 text-[11px] font-medium tracking-wide text-[var(--token-card-price-color,var(--dir-accent,#c8a04a))]"
            >
              {data.priceFromLabel}
            </p>
          ) : null}
        </div>
      </Root>
    );
  }

  if (style === "profile") {
    // "Cinematic" — full-bleed statement card built to the 02 · Cinematic
    // canvas: availability pill top-left, gold "EXCLUSIVE · {agency}"
    // eyebrow, oversized serif name (surname italic), gold hairline, a
    // ruled three-column fact strip (rating fills the third column), then
    // price + a solid gold Inquire pill. Shares portrait's photo primitive
    // so it stays in the token cascade.
    const topPill = show.showAvailability
      ? (availabilitySlot ?? (
          <span
            data-card-availability
            title={data.availabilityLabel}
            className="pointer-events-none inline-flex h-[26px] max-w-full items-center gap-1.5 overflow-hidden rounded-full border border-white/[0.28] bg-[rgba(6,6,8,0.62)] px-2.5 text-[10px] font-semibold tracking-[0.02em] text-[#f3efe6] backdrop-blur-md @[280px]:h-[30px] @[280px]:gap-2 @[280px]:px-3 @[280px]:text-[11px] @[280px]:uppercase @[280px]:tracking-[0.14em]"
          >
            <span
              aria-hidden
              className={`size-[7px] shrink-0 rounded-full ${
                data.availabilityKnown ? "bg-[#7ED957]" : "bg-white/40"
              }`}
            />
            <span className="hidden truncate @[220px]:inline">{data.availabilityLabel}</span>
          </span>
        ))
      : null;
    const [firstName, ...rest] = displayName ? displayName.split(/\s+/) : [];
    const restName = rest.join(" ");
    const typeLine = [
      show.showTalentType ? data.primaryType : null,
      show.showLocation ? data.location : null,
    ].filter(Boolean);

    return (
      <Root
        {...rootProps}
        data-card-style="profile"
        className={`${TALENT_CARD_CLASS} @container group/card relative block overflow-hidden rounded-2xl bg-[#141416] @[280px]:rounded-[22px] text-[#f3efe6] outline-none ring-1 ring-white/[0.06] transition-[box-shadow] duration-300 hover:shadow-[0_18px_40px_-22px_rgba(0,0,0,0.7)] focus-visible:ring-2 focus-visible:ring-[var(--dir-accent,#c8a04a)] ${
          rootMode === "button" ? "cursor-pointer" : ""
        }`}
      >
        <Photo
          data={data}
          aspectRatio={aspectRatio}
          priority={priority}
          rounded="rounded-none"
        />

        <div
          aria-hidden
          data-card-scrim
          className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_top,rgba(6,6,8,0.97)_0%,rgba(6,6,8,0.88)_30%,rgba(6,6,8,0.5)_52%,rgba(6,6,8,0.3)_100%)]"
        />

        {topPill ? (
          <div className="absolute left-2.5 top-2.5 z-[1] max-w-[calc(100%-88px)] @[280px]:left-4 @[280px]:top-4 @[280px]:max-w-[calc(100%-112px)]">
            {topPill}
          </div>
        ) : null}
        {badgeSlot ? <div className="absolute inset-0 z-[2]">{badgeSlot}</div> : null}
        {secondaryActionSlot ? (
          <div className="absolute right-2.5 top-2.5 z-[3] @[280px]:right-4 @[280px]:top-4">
            {secondaryActionSlot}
          </div>
        ) : null}

        <div
          className={`absolute inset-x-0 bottom-0 z-[1] flex flex-col gap-1 px-3 pb-3 @[280px]:gap-2.5 ${
            compact ? "@[280px]:px-4 @[280px]:pb-4" : "@[280px]:px-5 @[280px]:pb-5"
          }`}
          data-card-body
        >
          {show.showBadges && data.isExclusive ? (
            <span
              data-card-badge-exclusive
              className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--token-card-price-color,var(--dir-accent,#c8a04a))] @[280px]:text-[11px] @[280px]:tracking-[0.2em]"
            >
              Exclusive
              {data.agencyName ? ` · ${data.agencyName}` : ""}
            </span>
          ) : null}
          {displayName ? (
            <h3
              data-card-name
              className={`font-[family-name:var(--font-fraunces,Georgia,serif)] font-normal leading-none tracking-[-0.02em] text-[var(--token-card-name-color,#f3efe6)] ${
                compact
                  ? "text-[20px]! @[220px]:text-[26px]! @[300px]:text-[30px]!"
                  : "text-[22px]! @[220px]:text-[26px]! @[300px]:text-[34px]!"
              }`}
            >
              {firstName}
              {restName ? <em className="italic"> {restName}</em> : null}
            </h3>
          ) : null}
          {displayName ? (
            <span
              aria-hidden
              data-card-name-rule
              className="block h-px w-10 bg-[var(--dir-accent,#c8a04a)]"
            />
          ) : null}
          {typeLine.length > 0 ? (
            <p className="truncate text-[11px] leading-tight text-[var(--token-card-muted,rgba(243,239,230,0.78))] @[280px]:text-[13px]">
              {typeLine.join(" · ")}
            </p>
          ) : null}
          {traitSlot ? (
            <div className="hidden @[200px]:block">{traitSlot}</div>
          ) : (
            <StandingChip data={data} onScrim showStanding={showStanding} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 @[280px]:gap-x-3">
            {data.priceFromLabel ? (
              <p
                data-card-price-from
                className="whitespace-nowrap text-[12px] font-semibold text-[var(--token-card-name-color,#f3efe6)] @[280px]:text-[15px]"
              >
                {data.priceFromLabel}
                {data.priceFromUnitLabel ? (
                  <span
                    data-card-price-unit
                    className="ml-1 hidden text-[10px] font-normal text-[var(--token-card-muted,rgba(243,239,230,0.7))] @[220px]:inline @[280px]:text-[12px]"
                  >
                    {data.priceFromUnitLabel}
                  </span>
                ) : null}
              </p>
            ) : (
              <span />
            )}
            {ctaSlot ? <div className="ml-auto shrink-0">{ctaSlot}</div> : null}
          </div>
        </div>
      </Root>
    );
  }

  return (
    <Root
      {...rootProps}
      data-card-style="portrait"
      className={`${TALENT_CARD_CLASS} group/card relative block overflow-hidden rounded-2xl border border-border outline-none transition-[border-color,box-shadow] duration-200 hover:border-[var(--dir-accent-line)] hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.75)] focus-visible:ring-2 focus-visible:ring-foreground/30 ${
        rootMode === "button" ? "cursor-pointer" : ""
      }`}
    >
      <Photo
        data={data}
        aspectRatio={aspectRatio}
        priority={priority}
        rounded="rounded-none"
      />

      {/* Legibility scrim. Tagged so a card family (editorial-noir, …) can
          restyle the overlay in P3. */}
      <div
        aria-hidden
        data-card-scrim
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
      />

      {/* badgeSlot sits over the media (trust mark, favorite control). The
          favorite control inside stops its own propagation, so a card-level
          onActivate doesn't double-fire. */}
      {badgeSlot ? <div className="absolute inset-0 z-[2]">{badgeSlot}</div> : null}
      {/* secondaryActionSlot (e.g. the shortlist "+") sits beside the heart. */}
      {secondaryActionSlot ? (
        <div className="absolute right-2.5 top-2.5 z-[3]">
          {secondaryActionSlot}
        </div>
      ) : null}

      {show.showBadges ? (
        <div className="absolute left-2.5 top-2.5 z-[1] flex flex-wrap gap-1.5">
          {data.verified ? <VerifiedBadge /> : null}
          <OwnershipBadge data={data} />
        </div>
      ) : null}

      {/*
        The name block sits ON the photograph, and the roster is shot on white
        studio backdrops — so white type on a pale frame was landing on white.
        A drop-shadow alone could not carry it. This scrim is the same recipe
        the editorial plates and the division tiles use: transparent at the
        top, near-opaque where the type actually is. It is a sibling rather
        than a background on the text block so the padding stays independent
        of how tall the fade needs to be.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-1/2 bg-gradient-to-t from-[rgba(6,6,8,0.92)] via-[rgba(6,6,8,0.55)] to-transparent"
        data-card-scrim
      />

      <div
        className={`absolute inset-x-0 bottom-0 z-[1] flex flex-col gap-1 ${
          compact ? "px-3 pb-2.5" : "px-3.5 pb-3.5"
        }`}
        data-card-body
      >
        {displayName ? (
          <h3
            data-card-name
            // Falls back to white, so a tenant that never set the token keeps
            // the exact previous rendering.
            className={`font-display font-medium leading-tight tracking-wide text-[var(--token-card-name-color,#fff)] drop-shadow-sm ${
              compact ? "text-sm sm:text-base" : "text-base sm:text-lg"
            }`}
          >
            {displayName}
          </h3>
        ) : null}
        {displayName ? (
          // One deliberate accent moment per card: a short gold hairline
          // under the name (follows the tenant accent via --dir-accent).
          <span
            aria-hidden
            data-card-name-rule
            className={`mt-0.5 block h-px w-7 bg-[var(--dir-accent)] ${
              compact ? "mb-0" : "mb-0.5"
            }`}
          />
        ) : null}
        {(show.showTalentType && data.primaryType) ||
        (show.showLocation && data.location) ? (
          <p className="truncate text-xs text-[var(--token-card-muted,rgba(255,255,255,0.8))]">
            {show.showTalentType ? data.primaryType : null}
            {/* On a 2-up mobile grid the caption truncates mid-word
                ("Commercial Model · Pla…"), so a clipped city conveys nothing
                while costing the role its legibility. The separator + city are
                hidden below sm and reappear once there is room; the city is
                still on the profile and in the filters. */}
            {show.showLocation && data.location ? (
              <span className="hidden sm:inline">
                {show.showTalentType && data.primaryType ? "  ·  " : null}
                {data.location}
              </span>
            ) : null}
          </p>
        ) : null}
        {traitSlot}
        <StandingChip data={data} onScrim showStanding={showStanding} />
        {/* availabilitySlot overrides the built-in line (e.g. the Discover
            14-day strip). Falls back to the default white-over-scrim line. */}
        {availabilitySlot ??
          (show.showAvailability ? (
            <span
              data-card-availability
              className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-[var(--token-card-muted,rgba(255,255,255,0.75))]"
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${
                  data.availabilityKnown ? "bg-white/80" : "bg-white/40"
                }`}
              />
              {data.availabilityLabel}
            </span>
          ) : null)}
        {data.priceFromLabel ? (
          <p
            data-card-price-from
            className="mt-0.5 text-[11px] font-medium tracking-wide text-[var(--token-card-price-color,var(--impronta-gold-bright,var(--dir-accent,#c8a04a)))]"
          >
            {data.priceFromLabel}
          </p>
        ) : null}
        {showAgencyLine ? <AgencyLine data={data} /> : null}
        {ctaSlot ? <div className="mt-2">{ctaSlot}</div> : null}
      </div>
    </Root>
  );
}
