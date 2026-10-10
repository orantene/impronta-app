"use client";

/**
 * Catalog row + offering detail helpers (split from services-catalog-filter
 * for the 800-line ratchet; TUL-62 signedIn prop needed headroom).
 */

import { intakeDetail } from "@/lib/talent/offering-intake";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { formatMoney } from "@/lib/talent/offerings-money";
import {
  formatOfferingWhereLabel,
  offeringWhereFromAttributes,
  type OfferingRequestDetail,
} from "@/lib/talent/offering-request-detail";
import {
  catalogRowCtaLabel,
  offeringPriceUnit,
  catalogRowMinCents,
  catalogRowShowsFrom,
} from "@/components/public-booking/catalog-booking-logic";
import { catalogRowPriceText } from "./services-catalog-bar-price";
import { catalogDurationShort } from "./services-catalog-format";
import { catalogDurationPhrase } from "./services-catalog-title";
import { dispatchCatalogOffering } from "./catalog-offering-dispatch";
import {
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";

// F4 / WSF-B: one derivation (deriveOfferingCta) shared with OfferingCta and
// catalogRowCtaLabel. The talent default applies only to services that
// inherit; a service with its own instant mode books instantly, which the
// server (assertInstantPosture) already accepts.
function deriveFor(
  offering: TalentOffering,
  confirmsByHand: boolean,
  bookingPosture: TalentBookingPosture,
) {
  return deriveOfferingCta({ offering, defaults: { bookingPosture }, confirmsByHand });
}

export function detailFor(
  offering: TalentOffering,
  confirmsByHand: boolean,
  bookingPosture: TalentBookingPosture = PLATFORM_DEFAULT_BOOKING_POSTURE,
): OfferingRequestDetail {
  const { instant } = deriveFor(offering, confirmsByHand, bookingPosture);
  const where = offeringWhereFromAttributes(offering.attributes);
  return {
    offeringId: offering.id,
    talentProfileId: offering.talentProfileId,
    title: offering.title,
    kind: offering.kind,
    priceType: offering.priceType,
    priceDisplay: offering.priceDisplay,
    amountCents: offering.amountCents,
    currency: offering.currency,
    durationMinutes: offering.durationMinutes,
    allowPayInPerson: offering.allowPayInPerson,
    requireAccountToBook: offering.requireAccountToBook === true,
    reserveMode: offering.reserveMode,
    depositPct: offering.depositPct,
    cancellationHours: offering.cancellationHours,
    imageUrl: offering.imageUrls[0] ?? null,
    variants: offering.variants ?? [],
    addOns: offering.addOns ?? [],
    inventoryQty: offering.inventoryQty,
    capacityPoolId: offering.capacityPoolId,
    intent: instant ? "instant" : "request",
    description: offering.description,
    where: where.length ? where : undefined,
    ...intakeDetail(offering.attributes),
  };
}

export function dispatchOffering(
  offering: TalentOffering,
  confirmsByHand: boolean,
  startAt?: "when",
  inclusion?: string | null,
  bookingPosture: TalentBookingPosture = PLATFORM_DEFAULT_BOOKING_POSTURE,
) {
  dispatchCatalogOffering({
    offering,
    confirmsByHand,
    bookingPosture,
    detail: {
      ...detailFor(offering, confirmsByHand, bookingPosture),
      startAt,
      inclusion: inclusion ?? undefined,
    },
  });
}

export function CatalogRow({
  item,
  locale,
  showPhoto,
  showDescription = true,
  showCategory = false,
  showDuration,
  showDelivery = false,
  showAvailability = false,
  showPrice = true,
  showUsdEquivalent,
  showBadges = false,
  showModeChip = false,
  priceInMeta = false,
  rowCard = false,
  confirmsByHand,
  bookingPosture = PLATFORM_DEFAULT_BOOKING_POSTURE,
  usdRates,
  ctaLabel,
  durationFormat = "auto",
  selected = false,
  onSelect,
}: {
  item: TalentOffering;
  locale: string;
  showPhoto: boolean;
  showDescription?: boolean;
  showCategory?: boolean;
  showDuration: boolean;
  showDelivery?: boolean;
  showAvailability?: boolean;
  showPrice?: boolean;
  showUsdEquivalent: boolean;
  showBadges?: boolean;
  showModeChip?: boolean;
  priceInMeta?: boolean;
  rowCard?: boolean;
  confirmsByHand: boolean;
  bookingPosture?: TalentBookingPosture;
  usdRates: UsdRates | null;
  ctaLabel?: string;
  durationFormat?: "auto" | "minutes" | "hours_minutes";
  selected?: boolean;
  onSelect?: () => void;
}) {
  const es = locale.startsWith("es");
  const cover = showPhoto ? item.imageUrls[0] : undefined;
  const onRequest = item.visibility === "on_request";
  const quote =
    item.priceDisplay === "quote" || item.priceType === "custom" || item.amountCents == null;
  const minCents = catalogRowMinCents(item);
  const ladder = catalogRowShowsFrom(item);
  const usd = usdEquivalentLabel(minCents, item.currency, usdRates, locale);
  const derived = deriveFor(item, confirmsByHand, bookingPosture);
  const cta = derived.cta;
  const label = catalogRowCtaLabel({
    selected,
    offering: item,
    locale,
    inspectorLabel: selected ? undefined : ctaLabel,
    confirmsByHand,
    bookingPosture,
  });
  const where = offeringWhereFromAttributes(item.attributes);
  const deliveryText = formatOfferingWhereLabel(where, locale);
  const modeChip =
    derived.effectiveMode === "request"
      ? es
        ? "Con confirmación"
        : "Needs confirmation"
      : derived.effectiveMode === "inquiry" || quote
        ? rowCard
          ? es
            ? "Por evento"
            : "By event"
          : es
            ? "Por cotización"
            : "By quote"
        : null;
  // One-line price for the meta row: "Desde $120 por uña" / "Desde $650" / "$900" / "A cotizar".
  const priceText = catalogRowPriceText(item, locale);
  // Priced per unit: the unit replaces the duration in the meta row.
  const perUnit = !!offeringPriceUnit(item.attributes, locale) && !onRequest && !quote && minCents != null;
  const badges: string[] = [];
  if (showBadges) {
    if (derived.effectiveMode === "instant") badges.push(es ? "Reserva inmediata" : "Instant booking");
    if (item.reserveMode === "deposit") badges.push(es ? "Seña" : "Deposit required");
    if (where.includes("remote")) badges.push(es ? "En línea" : "Online session");
  }
  const activate = () => {
    if (onSelect) onSelect();
    else dispatchOffering(item, confirmsByHand, undefined, undefined, bookingPosture);
  };
  // Empty grey placeholders look like a repeated "stock" thumb on every row.
  // Only paint a photo slot when the offering has a real public image.
  const photo = cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cover} alt="" className="site-builder-node--services-catalog-photo" />
  ) : null;
  return (
    <li
      className="site-builder-node--services-catalog-row"
      data-selected={selected ? "true" : undefined}
      data-has-photo={cover || showPhoto ? "true" : "false"}
      // Row card: whole-card click is a pointer convenience; the button stays the accessible control.
      onClick={
        rowCard && !derived.hidden
          ? (e) => {
              if ((e.target as HTMLElement).closest("button,a")) return;
              activate();
            }
          : undefined
      }
    >
      {photo && rowCard ? <span className="site-builder-node--services-catalog-thumb">{photo}</span> : photo}
      <span className="site-builder-node--services-catalog-copy">
        <strong className="site-builder-node--services-catalog-name" title={item.title}>
          <span className="site-builder-node--services-catalog-name-text">{item.title}</span>
          {selected ? (
            <span className="site-builder-node--services-catalog-check" aria-hidden>
              ✓
            </span>
          ) : null}
        </strong>
        {showCategory && item.category ? (
          <span className="site-builder-node--services-catalog-meta">{item.categoryLabel ?? item.category}</span>
        ) : null}
        {showDescription && item.description ? (
          <span className="site-builder-node--services-catalog-desc">{item.description}</span>
        ) : null}
        {priceInMeta ? (
          <span className="site-builder-node--services-catalog-duration" data-price-in-meta="true">
            {showDuration && !perUnit && item.durationMinutes && item.kind !== "product" ? (
              <>
                <span>{catalogDurationShort(item.durationMinutes)}</span>
                {showPrice ? <span aria-hidden>·</span> : null}
              </>
            ) : null}
            {showPrice ? <span className="site-builder-node--services-catalog-price">{priceText}</span> : null}
            {showModeChip && modeChip ? (
              <span className="site-builder-node--services-catalog-mode">{modeChip}</span>
            ) : null}
          </span>
        ) : showDuration && item.durationMinutes && item.kind !== "product" ? (
          <span className="site-builder-node--services-catalog-duration">
            {catalogDurationPhrase(item.durationMinutes, locale, durationFormat)}
          </span>
        ) : null}
        {showDelivery && deliveryText ? (
          <span className="site-builder-node--services-catalog-meta">{deliveryText}</span>
        ) : null}
        {showAvailability ? (
          <span className="site-builder-node--services-catalog-meta">
            {derived.effectiveMode === "instant"
              ? es
                ? "Confirmación inmediata"
                : "Instant confirmation"
              : es
                ? "Sujeto a confirmación"
                : "Subject to confirmation"}
          </span>
        ) : null}
        {showModeChip && modeChip && !priceInMeta ? (
          <span className="site-builder-node--services-catalog-mode">{modeChip}</span>
        ) : null}
        {badges.length ? (
          <span className="site-builder-node--services-catalog-badges">
            {badges.map((b) => (
              <span key={b} className="site-builder-node--services-catalog-badge">
                {b}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="site-builder-node--services-catalog-buy">
        {priceInMeta ? null : showPrice ? (
          <span className="site-builder-node--services-catalog-price">
            {onRequest || quote || minCents == null ? (
              <strong>{es ? (onRequest ? "Bajo consulta" : "Cotización a pedido") : onRequest ? "On request" : "Quote on request"}</strong>
            ) : (
              <>
                {ladder ? <small>{es ? "Desde" : "From"}</small> : null}
                <strong>{formatMoney(minCents, item.currency, locale)}</strong>
              </>
            )}
            {showUsdEquivalent && usd ? <span className="site-builder-node--services-catalog-usd">{usd}</span> : null}
          </span>
        ) : (
          <span className="site-builder-node--services-catalog-price" aria-hidden />
        )}
        {/* WSF-C §8: no route left for this service, no button. */}
        {derived.hidden ? (
          rowCard ? (
            <button
              type="button"
              disabled
              data-paused="true"
              className="site-builder-node--services-catalog-cta"
            >
              {es ? "En pausa" : "Paused"}
            </button>
          ) : null
        ) : (
          <button
            type="button"
            onClick={activate}
            data-offering-cta={cta}
            data-offering-id={item.id}
            data-selected={selected ? "true" : undefined}
            className="site-builder-node--services-catalog-cta"
            aria-pressed={selected}
          >
            {label}
          </button>
        )}
      </span>
    </li>
  );
}
