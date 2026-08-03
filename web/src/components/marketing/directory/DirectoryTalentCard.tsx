"use client";

import { TalentCard } from "@/components/talent-cards/TalentCard";
import {
  cardDesignToCssVars,
  DEFAULT_CARD_DESIGN,
  familyToTalentCardStyle,
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
 * Cross-tenant palette: the marketing directory mixes rows from many agencies
 * on one page, where the `<html>` token cascade can only carry ONE tenant. So
 * each card root carries its own agency's `--token-card-*` vars inline, resolved
 * per `agencyTenantId` by `resolveCardDesign` (see the directory page). The
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
  const design = talent.design ?? DEFAULT_CARD_DESIGN;
  const data = toCanonicalCardData(talent);
  const style = familyToTalentCardStyle(design.family);
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

  return (
    <div
      style={cssVars}
      data-token-template-directory-card-family={design.family}
      data-card-design-scope=""
      data-directory-card
      onClickCapture={handleClickCapture}
    >
      <TalentCard
        data={data}
        style={style}
        show={{
          showName: true,
          showTalentType: true,
          showLocation: true,
          showAvailability: true,
          showBadges: true,
        }}
        nameFallback="first_name"
        aspect="4:5"
        priority={priority}
        index={style === "editorial" ? index : undefined}
      />
    </div>
  );
}
