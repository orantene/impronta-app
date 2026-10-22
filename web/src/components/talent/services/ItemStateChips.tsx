import {
  bookingModeLabel,
  publicationLabel,
  publicationWord,
} from "@/lib/talent/publication-state";
import { quoteNeedsPriceReminder } from "@/lib/talent/offering-price-mode";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  inheritedModeLabel,
  overrideBadgeLabel,
  siteBookingModeView,
} from "@/lib/talent/site-booking-mode";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";
import { translatorFor } from "@/i18n/translator-for";
import { MissingTranslationChip } from "@/components/admin/shell/internal/page-modules/catalog/MissingTranslationChip";
import { NeedsPriceChip } from "@/components/admin/shell/internal/page-modules/catalog/NeedsPriceChip";

export function ItemStateChips({
  item,
  locale,
  showBooking = true,
  hideFailed = false,
  instantReady,
  sitePosture,
  primary,
  locales,
}: {
  item: TalentOffering;
  locale: string;
  showBooking?: boolean;
  hideFailed?: boolean;
  /** false = no working hours yet, so instant reads as a request. */
  instantReady?: boolean;
  /** The site-wide booking mode (selling_defaults). Omit and the old label shows. */
  sitePosture?: TalentBookingPosture;
  /**
   * The talent's languages, handed in by the caller (server settings, never the
   * client store alone). Omit either and no translation cue is drawn. The chip
   * only appears for exactly two languages with one title missing.
   */
  primary?: string;
  locales?: readonly string[];
}) {
  const word = publicationWord({ status: item.status, firstPublishedAt: item.firstPublishedAt });
  const soldOut = item.inventoryQty === 0;
  const onRequest = item.visibility === "on_request";
  const agencyOnly = item.visibility === "agency_only";
  const siteView = sitePosture ? siteBookingModeView(item.bookingMode, sitePosture) : null;
  const priced = item.priceDisplay !== "quote" && item.priceType !== "custom" && item.amountCents != null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showBooking && (
        <span className="text-[11px] font-medium text-admin-ink-muted">
          {siteView?.inherited && priced
            ? inheritedModeLabel(siteView.effective, locale)
            : bookingModeLabel({ ...item, instantReady }, locale)}
        </span>
      )}
      {showBooking && siteView?.overridesSite && priced && (
        <span
          data-testid="site-mode-override-badge"
          className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
        >
          {overrideBadgeLabel(siteView.effective, locale, sitePosture)}
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          word === "live"
            ? "bg-[rgba(15,79,62,0.12)] text-[#0F4F3E]"
            : word === "hidden"
              ? "bg-[rgba(11,11,13,0.08)] text-admin-ink-muted"
              : "border border-admin-border-soft bg-white text-admin-ink"
        }`}
      >
        {publicationLabel(word, locale)}
      </span>
      {soldOut && (
        <span className="rounded-full bg-[rgba(11,11,13,0.08)] px-2 py-0.5 text-[10px] font-semibold text-admin-ink">
          {locale.startsWith("es") ? "Agotado" : "Sold out"}
        </span>
      )}
      {item.inventoryQty != null && item.inventoryQty > 0 && item.inventoryQty <= 5 && (
        <span className="text-[11px] text-admin-ink-muted">
          {item.inventoryQty} {locale.startsWith("es") ? "restantes" : "left"}
        </span>
      )}
      {onRequest && (
        <span className="text-[11px] text-admin-ink-muted">
          {locale.startsWith("es") ? "Bajo consulta" : "On request"}
        </span>
      )}
      {agencyOnly && (
        <span className="text-[11px] text-admin-ink-muted">
          {locale.startsWith("es") ? "Solo agencias" : "Agencies only"}
        </span>
      )}
      {quoteNeedsPriceReminder(item) && (
        <span className="rounded-full border border-admin-border-soft bg-white px-2 py-0.5 text-[11px] font-semibold text-admin-ink" data-testid="quote-needs-price">
          {locale.startsWith("es") ? "Agrega un precio para recibir reservas" : "Add a price to take bookings"}
        </span>
      )}
      <NeedsPriceChip item={item} t={translatorFor(locale)} />
      {primary && locales ? (
        <MissingTranslationChip item={item} primary={primary} locales={locales} uiLocale={locale} t={translatorFor(locale)} />
      ) : null}
      {hideFailed && (
        <span className="rounded-full bg-[rgba(176,32,32,0.1)] px-2 py-0.5 text-[10px] font-semibold text-[#8A1F1F]">
          {locale.startsWith("es") ? "No se pudo ocultar" : "Could not hide it"}
        </span>
      )}
    </span>
  );
}
