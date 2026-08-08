"use client";

import { useRef } from "react";

import { TalentCard } from "@/components/talent-cards/TalentCard";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import {
  cardDesignToCssVars,
  DEFAULT_CARD_DESIGN,
  familyToTalentCardStyle,
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
  index,
}: {
  /** The directory row. Carries its own resolved `design` (per `agencyTenantId`,
   *  attached server-side by the page); independents / load-more rows omit it
   *  and fall back to the platform `classic` default. */
  talent: DirectoryCardRow;
  priority?: boolean;
  index?: number;
}) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const design = talent.design ?? DEFAULT_CARD_DESIGN;
  const data = toCanonicalCardData(talent);
  // The tenant's explicit Card Design layout defaults win; the family only
  // decides the render branch when no explicit style was published.
  const style = design.cardStyle ?? familyToTalentCardStyle(design.family);
  const aspect = design.cardAspect ?? "4:5";
  const density = design.density ?? "comfortable";
  const cssVars = cardDesignToCssVars(design);

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

  return (
    <div
      ref={mediaRef}
      style={cssVars}
      data-token-template-directory-card-family={design.family}
      data-card-design-scope=""
      data-directory-card
      className="group/cardwrap relative"
      onClickCapture={handleClickCapture}
    >
      <TalentCard
        data={data}
        style={style}
        show={resolveCardShow(design)}
        nameFallback="first_name"
        aspect={aspect}
        density={density}
        priority={priority}
        index={style === "editorial" ? index : undefined}
      />
      {/* Favorite heart + hover-revealed Inquire pill — the same canonical
          cluster DirectoryCardAdapter mounts on the storefront directory.
          Both hooks are guest-capable, and the actions render null until the
          discovery-state provider hydrates, so this stays safe on any surface
          that omits the provider. */}
      {showFavorite || showInquire ? (
        <div className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-2">
          {showInquire ? (
            <div className="pointer-events-none translate-x-1 opacity-0 transition-all duration-200 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:opacity-100 group-hover/cardwrap:pointer-events-auto group-hover/cardwrap:translate-x-0 group-hover/cardwrap:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-x-0 [@media(hover:none)]:opacity-100">
              <TalentCardActions
                talentProfileId={talent.id}
                profileCode={talent.profileCode ?? ""}
                displayName={data.name}
                sourcePage="/directory"
                variant="pill"
                hideFavorite
                portraitUrl={talent.headshotUrl ?? null}
                getInquiryPhotoRect={() =>
                  mediaRef.current
                    ?.querySelector("img")
                    ?.getBoundingClientRect() ?? null
                }
              />
            </div>
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
