import { TalentCard } from "@/components/talent-cards/TalentCard";
import type { TalentCardStyle } from "@/components/talent-cards/talent-card-shape";
import {
  cardDesignToCssVars,
  DEFAULT_CARD_DESIGN,
  type CardDesignFamily,
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
 * uses, so a card-family stylesheet rule targets it identically.
 *
 * Browse-only: each card links to `/t/<code>` (handled inside `<TalentCard>`).
 * No pricing, no cart/favorite, no "hire".
 */

/** Editorial families get the byline-under-portrait render; everything else
 *  (classic / service-professional / minimal-portrait) uses the portrait
 *  render with the name over a legibility scrim. */
const EDITORIAL_FAMILIES: ReadonlySet<CardDesignFamily> = new Set([
  "editorial-noir",
  "editorial-bridal",
  "magazine",
]);

function familyToStyle(family: CardDesignFamily): TalentCardStyle {
  return EDITORIAL_FAMILIES.has(family) ? "editorial" : "portrait";
}

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
  const style = familyToStyle(design.family);
  const cssVars = cardDesignToCssVars(design);

  return (
    <div
      style={cssVars}
      data-token-template-directory-card-family={design.family}
      data-directory-card
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
