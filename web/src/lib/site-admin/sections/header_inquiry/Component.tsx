import { PublicHeaderDiscoveryTools } from "@/components/public-header-discovery-tools";
import { createTranslator } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import {
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "../shared/header-widget";
import type { SectionComponentProps } from "../types";
import type { HeaderInquiryV1 } from "./schema";

/**
 * WS-A A5 — header INQUIRY widget. Mounts the SAME `PublicHeaderDiscoveryTools`
 * cluster the legacy header uses — the ✈ inquiry-cart drawer trigger (alongside
 * the ♥ favorites trigger; they are one coupled cluster in the live header).
 * Counts + localized copy are resolved exactly as `HeaderAuthArea` resolves them.
 *
 *   - editor canvas (`preview`)  → a static placeholder chip. NO discovery read,
 *     NO client island mount.
 *   - published shell            → the real interactive discovery cluster.
 */
export async function HeaderInquiryComponent({
  preview,
  locale,
}: SectionComponentProps<HeaderInquiryV1>) {
  if (preview) {
    return (
      <HeaderWidgetPlaceholder
        typeKey="header_inquiry"
        label="Inquiry"
        glyph={
          <HeaderWidgetGlyph>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </HeaderWidgetGlyph>
        }
      />
    );
  }

  const t = createTranslator(locale as Locale);
  const [savedIds, favoriteIds] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
  ]);
  const directoryHeaderCopy = {
    favoritesAria: t("public.header.directoryShortlistAria"),
    favoritesTooltipEmpty: t("public.header.directoryShortlistTooltipEmpty"),
    favoritesTooltipWithCount: t(
      "public.header.directoryShortlistTooltipWithCount",
    ),
    inquiryAriaEmpty: t("public.header.directoryInquirySparklesAriaEmpty"),
    inquiryAriaWithCart: t(
      "public.header.directoryInquirySparklesAriaWithShortlist",
    ),
    inquiryTooltipEmpty: t("public.header.directoryInquiryTooltipEmpty"),
    inquiryTooltipWithCart: t(
      "public.header.directoryInquiryTooltipWithShortlist",
    ),
  };

  return (
    <div
      className="site-header-widget-embed site-header-widget-embed--inquiry"
      data-header-widget="header_inquiry"
      data-header-widget-mode="live"
    >
      <PublicHeaderDiscoveryTools
        initialFavoritesCount={favoriteIds.length}
        initialCartCount={savedIds.length}
        directoryHeaderCopy={directoryHeaderCopy}
      />
    </div>
  );
}
