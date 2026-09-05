import type { CSSProperties, ElementType, KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";

import { StaticStars } from "@/components/reviews/star-rating";
import {
  computeStandingTier,
  meetsCredibilityFloor,
  standingTierLabel,
} from "@/lib/reviews/craft-standing";

import {
  TALENT_CARD_ASPECT_RATIO,
  TALENT_CARD_CLASS,
  TALENT_CARD_VARS,
  type CanonicalTalentCardData,
  type TalentCardNameFallback,
  type TalentCardProps,
  type TalentCardRootMode,
} from "./talent-card-shape";
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

function OwnershipBadge({ data }: { data: CanonicalTalentCardData }) {
  // A tenant storefront directory shows ONE agency's roster, so stamping the
  // agency's own name on every card is pure repetition (it's already the site
  // brand in the header). Render only a DIFFERENTIATING signal: an exclusive
  // mark (gold, on-brand) or an independent tag. A bare own-agency name → no
  // badge at all. Cross-agency surfaces still surface "Exclusive"/"Independent".
  if (data.isExclusive) {
    return (
      <span
        data-card-ownership
        data-card-chip
        className="pointer-events-none inline-flex max-w-full items-center truncate rounded-full border border-[var(--dir-accent)] bg-background/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--impronta-gold-bright)] backdrop-blur-sm"
      >
        Exclusive
      </span>
    );
  }
  if (data.agencyName) return null;
  return (
    <span
      data-card-ownership
      data-card-chip
      className="pointer-events-none inline-flex max-w-full items-center truncate rounded-full border border-border bg-background/85 px-2 py-0.5 text-[10px] font-medium tracking-wide text-foreground backdrop-blur-sm"
    >
      Independent
    </span>
  );
}

/**
 * Craft standing chip — the same credibility-gated signal the directory
 * list-row renders (`talent-directory-list-row.tsx`), reused here so the
 * grid card carries it too. Rendered only past `meetsCredibilityFloor`; the
 * `directory.card.show-standing` / `directory.card.standing-style` tokens
 * gate visibility via the `data-card-standing*` hooks (token-presets.css),
 * so absence-by-token-off stays a pure CSS toggle, not a JS branch here.
 *
 * `onScrim` swaps the tone for the portrait style's white-over-photo caption
 * (matches the name/type/availability lines already on that scrim); the
 * editorial style renders on the card's plain surface, so it uses the
 * muted-foreground token like its other caption lines.
 */
function StandingChip({
  data,
  onScrim,
  showStanding = "auto",
}: {
  data: CanonicalTalentCardData;
  onScrim: boolean;
  showStanding?: "auto" | "always";
}) {
  if (data.ratingAvg == null || !meetsCredibilityFloor(data.ratingCount)) {
    return null;
  }
  const ratingCount = data.ratingCount ?? 0;
  const tier = computeStandingTier({
    ratingCount,
    ratingAvg: data.ratingAvg,
    wouldBookAgainPct: data.wouldBookAgainPct ?? null,
  });
  const textClass = onScrim ? "text-white/80" : "";
  const textStyle = onScrim ? undefined : { color: TALENT_CARD_VARS.muted };
  // `gated` (default) keeps the `data-card-standing` hook the CSS token gate
  // matches against; `showStanding="always"` swaps to a different attribute
  // so `html:not([data-token-card-standing]) [data-card-standing]{display:none}`
  // in token-presets.css doesn't hide it on surfaces (like Discover) that
  // resolve the reviews entitlement themselves and have no tenant token on
  // `<html>` to opt into.
  const gated = showStanding !== "always";
  const wrapperAttrs = gated
    ? { "data-card-standing": true }
    : { "data-card-standing-shown": true };
  return (
    <div
      {...wrapperAttrs}
      className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span
        data-card-standing-tier
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] ${
          onScrim
            ? "border border-white/[0.25] bg-white/[0.08] text-white/90"
            : "border border-border bg-background/60 text-foreground/90"
        }`}
      >
        {standingTierLabel(tier)}
      </span>
      <span
        data-card-standing-signal
        className={`inline-flex items-center gap-1.5 text-[11px] ${textClass}`}
        style={textStyle}
      >
        <StaticStars rating={data.ratingAvg} size={11} />
        <span className="tabular-nums">{data.ratingAvg.toFixed(1)}</span>
        <span aria-hidden className="text-[var(--dir-accent)]">
          ·
        </span>
        <span className="tabular-nums">{ratingCount}</span>
      </span>
    </div>
  );
}

function AvailabilityLine({ data }: { data: CanonicalTalentCardData }) {
  return (
    <span
      data-card-availability
      className="inline-flex items-center gap-1.5 text-[11px]"
      style={{ color: TALENT_CARD_VARS.muted }}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          data.availabilityKnown ? "bg-foreground/60" : "bg-foreground/25"
        }`}
      />
      {data.availabilityLabel}
    </span>
  );
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

  // Portrait (default / canonical). The five non-portrait/-editorial schema
  // styles intentionally fall through here until their kits land.
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
      </div>
    </Root>
  );
}
