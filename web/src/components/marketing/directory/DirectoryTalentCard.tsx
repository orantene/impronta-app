"use client";

import { useRef } from "react";

import { TalentCard } from "@/components/talent-cards/TalentCard";
import {
  CardFactStrip,
  pickAttributeLines,
  pickFitLabels,
} from "@/components/talent-cards/talent-card-trait-row";
import { type CaptionNorms, isRedundant, NO_CAPTION_NORMS } from "@/lib/directory/caption-norms";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { TalentQuickViewButton } from "@/components/directory/talent-quick-view";
import {
  cardDesignToCssVars,
  DEFAULT_CARD_DESIGN,
  resolveCardShow,
} from "@/lib/site-admin/server/card-design-shape";
import type { DirectoryCardRow } from "./shared";
import { toCanonicalCardData } from "./shared";

/**
 * Grid card for the public global directory — now a thin wrapper over the
 * canonical `<TalentCard>` (P3). It maps the cross-tenant directory row to the
 * canonical card data and lets `<TalentCard>` emit `className="talent-card"`
 * plus the `data-card-*` hooks, so the directory card finally honours the
 * `--token-card-*` palette like every other card surface (the bespoke `--plt-*`
 * card palette is retired).
 *
 * Palette: each card root carries `--token-card-*` vars inline from the row's
 * attached `design`. On the marketing global directory the page attaches ONE
 * uniform design — the platform hub tenant's, i.e. what the hub workspace's
 * Card Design admin publishes — so the public grid reads as one product. The
 * `family` picks the editorial vs portrait render and is exposed as the same
 * `data-token-template-directory-card-family` attribute the storefront cascade
 * uses — paired with `data-card-design-scope` so the family stylesheet rules
 * (written as `:is(html, [data-card-design-scope])[data-token-…]` in
 * token-presets.css) actually match this non-`<html>` carrier.
 *
 * Browse-only: each card links to `/t/<code>` (handled inside `<TalentCard>`).
 * No pricing, no cart/favorite, no "hire". Client component solely so the
 * per-row tenant's `directory.card.profile-popup` ceiling can intercept the
 * click: "off" turns the soft `<Link>` navigation into a hard load, which the
 * `@modal` route interception cannot catch — the same pattern as
 * `DirectoryCardAdapter`.
 */
export function DirectoryTalentCard({
  talent,
  priority,
  captionNorms = NO_CAPTION_NORMS,
}: {
  /** The directory row. Carries its own resolved `design` (per `agencyTenantId`,
   *  attached server-side by the page); independents / load-more rows omit it
   *  and fall back to the platform `classic` default. */
  talent: DirectoryCardRow;
  priority?: boolean;
  /** What is NORMAL for this grid — matching lines are dropped (see lib/directory/caption-norms). */
  captionNorms?: CaptionNorms;
}) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const design = talent.design ?? DEFAULT_CARD_DESIGN;
  const data = toCanonicalCardData(talent);
  // The tenant's explicit Card Design layout defaults win; the family only
  // decides the render branch when no explicit style was published.
  // Phase 1 of the hub card redesign: the public grid renders the Showcase
  // card regardless of the hub workspace's published style. Phase 2 makes
  // Showcase a selectable Card Design style and removes this override.
  const style = "showcase" as const;
  // Platform grid crop: 3:4 unless the hub published its own aspect. The
  // caption sits BELOW the photo on this surface's kits, so a 4:5 portrait
  // plus caption ran taller than a phone viewport per card.
  const aspect = design.cardAspect ?? "3:4";
  const density = design.density ?? "comfortable";
  const cssVars = cardDesignToCssVars(design);

  const baseShow = resolveCardShow(design);
  // Differential caption: "Open 30 of next 30 days" on every card tells the
  // visitor nothing — drop a line when it just repeats what the grid says.
  const show = {
    ...baseShow,
    showLocation:
      baseShow.showLocation && !isRedundant(data.location, captionNorms.dominantLocation),
    // The Showcase photo anchors on the availability pill; never drop it.
    showAvailability: baseShow.showAvailability,
  };

  const fitChips = pickFitLabels(data.fitLabels, 3);
  const traitLines = pickAttributeLines(data.cardAttributes, [], 3, 3);
  const traitSlot =
    design.showAttributes !== "off" && (fitChips.length > 0 || traitLines.length > 0) ? (
      <CardFactStrip fitChips={fitChips} traitLines={traitLines} tone="light" />
    ) : undefined;

  const handleClickCapture =
    design.profilePopup === "off" && data.profileHref
      ? (event: React.MouseEvent) => {
          const link = (event.target as HTMLElement).closest?.("a.talent-card");
          if (!link) return;
          // Preserve every native new-tab / save-link gesture.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(data.profileHref);
        }
      : undefined;

  // Card Design action CEILINGS: "off" hides the control tenant-wide. Unset
  // (the default) leaves both on — matching the admin's Directory-surface
  // promise ("Clients can save a favorite and start an inquiry").
  const showFavorite = design.showFavorite !== "off";
  const showInquire = design.showInquiry !== "off";

  // Showcase renders Inquire as a persistent panel CTA next to the price.
  const ctaSlot =
    showInquire ? (
      <TalentCardActions
        talentProfileId={talent.id}
        profileCode={talent.profileCode ?? ""}
        displayName={data.name}
        sourcePage="/directory"
        variant="pill"
        hideFavorite
        portraitUrl={talent.headshotUrl ?? null}
        getInquiryPhotoRect={() =>
          mediaRef.current?.querySelector("img")?.getBoundingClientRect() ?? null
        }
      />
    ) : undefined;

  return (
    <div
      ref={mediaRef}
      style={cssVars}
      data-token-template-directory-card-family={design.family}
      data-card-design-scope=""
      data-directory-card
      className="@container group/cardwrap relative"
      onClickCapture={handleClickCapture}
    >
      <TalentCard
        data={data}
        style={style}
        show={show}
        nameFallback="first_name"
        traitSlot={traitSlot}
        ctaSlot={ctaSlot}
        // Cross-tenant grid (many agencies, one page) — attribute the price
        // to the agency, unlike a tenant's own storefront where that would
        // just repeat the site's own brand back at the visitor.
        showAgencyLine
        aspect={aspect}
        density={density}
        priority={priority}
        // Platform-host surface: reviews-entitled, and the <html> standing
        // token gate never exists here — opt in the same way Discover does.
        showStanding="always"
      />
      {/* Favorite heart + quick-view eye, always visible. Both hooks are
          guest-capable and render null until the discovery-state provider
          hydrates, so this stays safe on any surface without the provider. */}
      {showFavorite || data.profileHref ? (
        <div className="absolute right-3 top-3 z-[2] flex items-center gap-2">
          {data.profileHref ? (
            <TalentQuickViewButton
              talentProfileId={talent.id}
              profileCode={talent.profileCode ?? ""}
              displayName={data.name}
              profileHref={data.profileHref}
              thumbnailUrl={talent.headshotUrl ?? null}
              locale="en"
              sourcePage="/directory"
              openLabel="Quick view"
              closeLabel="Close"
              viewProfileLabel="View profile"
            />
          ) : null}
          {showFavorite ? (
            <TalentCardActions
              talentProfileId={talent.id}
              profileCode={talent.profileCode ?? ""}
              displayName={data.name}
              sourcePage="/directory"
              variant="compact"
              hideInquiry
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
