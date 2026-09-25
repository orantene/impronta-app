"use client";

import { useEffect, useState } from "react";
import { resolveOfferingCta, offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { formatMoney } from "@/lib/talent/offerings-money";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { CatalogBookingSheet } from "@/components/public-booking/CatalogBookingSheet";
import {
  catalogRowCtaLabel,
  catalogRowHasOptions,
  type CatalogBookingMode,
} from "@/components/public-booking/catalog-booking-logic";
import { catalogCategoryJumpId, catalogDurationPhrase } from "./services-catalog-title";

export type CatalogGroup = { name: string | null; items: TalentOffering[]; note?: string | null };

function detailFor(offering: TalentOffering, confirmsByHand: boolean): OfferingRequestDetail {
  const raw = resolveOfferingCta(offering);
  const cta = confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = !confirmsByHand && (cta === "book_now" || cta === "buy_now");
  return {
    offeringId: offering.id,
    talentProfileId: offering.talentProfileId,
    title: offering.title,
    kind: offering.kind,
    priceType: offering.priceType,
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
  };
}

function dispatchOffering(
  offering: TalentOffering,
  confirmsByHand: boolean,
  startAt?: "when",
  inclusion?: string | null,
) {
  const raw = resolveOfferingCta(offering);
  const cta = confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = !confirmsByHand && (cta === "book_now" || cta === "buy_now");
  const slotEligible =
    cta === "request_to_book" && offering.kind !== "product" && (offering.durationMinutes ?? 0) > 0;
  const eventName =
    instant || (confirmsByHand && raw !== "ask_quote")
      ? "tulala:offering-instant"
      : slotEligible
        ? "tulala:offering-slot"
        : "tulala:offering-request";
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: { ...detailFor(offering, confirmsByHand), startAt, inclusion: inclusion ?? undefined },
    }),
  );
}

export function ServicesCatalogFilter({
  groups,
  locale,
  nav,
  showPhoto,
  showDuration,
  showUsdEquivalent,
  confirmsByHand,
  usdRates,
  ctaLabel,
  bookingMode = "demo",
  tenantId = null,
  nodeId,
}: {
  groups: CatalogGroup[];
  locale: string;
  nav: "pills" | "tabs" | "jump" | "flat";
  showPhoto: boolean;
  showDuration: boolean;
  showUsdEquivalent: boolean;
  confirmsByHand: boolean;
  usdRates: UsdRates | null;
  ctaLabel?: string;
  bookingMode?: CatalogBookingMode;
  tenantId?: string | null;
  /** Builder node id — used only for jump-nav fragment ids (serializable). */
  nodeId: string;
}) {
  const named = groups.filter((g) => g.name);
  const first = named[0]?.name ?? null;
  const [active, setActive] = useState<string | null>(first);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [selectedBits, setSelectedBits] = useState<string | null>(null);
  const [selectedTotal, setSelectedTotal] = useState(0);
  const [selectedCurrency, setSelectedCurrency] = useState("MXN");
  const [sheetOpen, setSheetOpen] = useState(false);
  const es = locale.startsWith("es");
  const filterNav = nav === "pills" || nav === "tabs";

  useEffect(() => {
    const onSelected = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        offeringId?: string;
        title?: string;
        detail?: string | null;
        totalCents?: number;
        currency?: string;
      } | null;
      if (!d?.offeringId) return;
      setSelectedId(d.offeringId);
      setSelectedTitle(d.title ?? null);
      setSelectedBits(d.detail ?? null);
      setSelectedTotal(d.totalCents ?? 0);
      setSelectedCurrency(d.currency ?? "MXN");
    };
    const onSheet = (e: Event) => {
      const d = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setSheetOpen(d?.open === true);
    };
    window.addEventListener("tulala:maison-selected", onSelected);
    window.addEventListener("tulala:maison-sheet", onSheet);
    return () => {
      window.removeEventListener("tulala:maison-selected", onSelected);
      window.removeEventListener("tulala:maison-sheet", onSheet);
    };
  }, []);

  const onRowAction = (item: TalentOffering, inclusion?: string | null) => {
    const hasOptions = catalogRowHasOptions(item);
    const onRequest = item.visibility === "on_request";
    if (hasOptions || onRequest) {
      dispatchOffering(item, confirmsByHand, undefined, inclusion);
      return;
    }
    setSelectedId(item.id);
    setSelectedTitle(item.title);
    setSelectedBits(null);
    setSelectedTotal(item.amountCents ?? 0);
    setSelectedCurrency(item.currency);
    dispatchOffering(item, confirmsByHand, "when", inclusion);
  };

  const continueFromBar = () => {
    const group = groups.find((g) => g.items.some((o) => o.id === selectedId));
    const found = group?.items.find((o) => o.id === selectedId);
    if (!found) return;
    dispatchOffering(found, confirmsByHand, "when", group?.note);
  };

  return (
    <div className="cb-island">
      {filterNav ? (
        <nav
          aria-label={es ? "Categorías" : "Categories"}
          className="site-builder-node--services-catalog-nav"
          data-category-nav={nav}
        >
          {named.map((g) => {
            const selected = active === g.name;
            return (
              <button
                key={g.name}
                type="button"
                aria-pressed={selected}
                data-catalog-tab={g.name ?? ""}
                className="site-builder-node--services-catalog-pill"
                data-active={selected ? "true" : "false"}
                onClick={() => setActive(g.name)}
              >
                {g.name}
              </button>
            );
          })}
        </nav>
      ) : nav === "jump" ? (
        <nav aria-label={es ? "Categorías" : "Categories"} className="site-builder-node--services-catalog-nav">
          {groups.map((g) => (
            <a
              key={g.name ?? "_"}
              href={`#${catalogCategoryJumpId(nodeId, g.name ?? "_")}`}
              className="site-builder-node--services-catalog-pill"
            >
              {g.name ?? (es ? "Otros" : "Other")}
            </a>
          ))}
        </nav>
      ) : null}

      {groups.map((g) => {
        const hidden = filterNav && Boolean(g.name) && active !== g.name;
        return (
          <div
            key={g.name ?? "_"}
            hidden={hidden}
            id={nav === "jump" ? catalogCategoryJumpId(nodeId, g.name ?? "_") : undefined}
            data-catalog-category={g.name ?? "_"}
            className="site-builder-node--services-catalog-group"
          >
            {nav === "jump" ? (
              <h3 className="site-builder-node--services-catalog-group-title">
                {g.name ?? (es ? "Otros" : "Other")}
              </h3>
            ) : null}
            <ul className="site-builder-node--services-catalog-list">
              {g.items.map((item) => (
                <CatalogRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  showPhoto={showPhoto}
                  showDuration={showDuration}
                  showUsdEquivalent={showUsdEquivalent}
                  confirmsByHand={confirmsByHand}
                  usdRates={usdRates}
                  ctaLabel={ctaLabel}
                  selected={selectedId === item.id}
                  onSelect={() => onRowAction(item, g.note)}
                />
              ))}
            </ul>
          </div>
        );
      })}

      <div className="cb-bar" data-show={!sheetOpen} data-has-selection={selectedId !== null}>
        <div className="cb-bar-text">
          <strong>{selectedTitle ?? (es ? "Elige tu servicio" : "Choose a service")}</strong>
          <span>
            {selectedId
              ? `${selectedBits ? `${selectedBits} · ` : ""}${formatMoney(selectedTotal, selectedCurrency, locale)}`
              : es
                ? "Tocá Seleccionar para armar tu reserva"
                : "Tap Select to start your booking"}
          </span>
        </div>
        {selectedId ? (
          <button type="button" onClick={continueFromBar}>
            {es ? "Continuar" : "Continue"}
          </button>
        ) : null}
      </div>

      <CatalogBookingSheet locale={locale} mode={bookingMode} tenantId={tenantId} />
    </div>
  );
}

export function CatalogRow({
  item,
  locale,
  showPhoto,
  showDuration,
  showUsdEquivalent,
  confirmsByHand,
  usdRates,
  ctaLabel,
  selected = false,
  onSelect,
}: {
  item: TalentOffering;
  locale: string;
  showPhoto: boolean;
  showDuration: boolean;
  showUsdEquivalent: boolean;
  confirmsByHand: boolean;
  usdRates: UsdRates | null;
  ctaLabel?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const cover = showPhoto ? item.imageUrls[0] : undefined;
  const price = offeringPriceLabel(item, locale);
  const usd = usdEquivalentLabel(item.amountCents, item.currency, usdRates, locale);
  const raw = resolveOfferingCta(item);
  const cta = confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const label = catalogRowCtaLabel({
    selected,
    offering: item,
    locale,
    inspectorLabel: selected ? undefined : ctaLabel,
  });
  return (
    <li className="site-builder-node--services-catalog-row" data-selected={selected ? "true" : undefined}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="site-builder-node--services-catalog-photo" />
      ) : (
        <span className="site-builder-node--services-catalog-photo" aria-hidden />
      )}
      <span className="site-builder-node--services-catalog-copy">
        <strong className="site-builder-node--services-catalog-name" title={item.title}>
          {item.title}
          {selected ? (
            <span className="site-builder-node--services-catalog-check" aria-hidden>
              {" "}
              ✓
            </span>
          ) : null}
        </strong>
        {item.description ? (
          <span className="site-builder-node--services-catalog-desc">{item.description}</span>
        ) : null}
        {showDuration && item.durationMinutes && item.kind !== "product" ? (
          <span className="site-builder-node--services-catalog-duration">
            {catalogDurationPhrase(item.durationMinutes, locale)}
          </span>
        ) : null}
      </span>
      <span className="site-builder-node--services-catalog-price">
        <strong>{price}</strong>
        {showUsdEquivalent && usd ? <span className="site-builder-node--services-catalog-usd">{usd}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => {
          if (onSelect) onSelect();
          else dispatchOffering(item, confirmsByHand);
        }}
        data-offering-cta={cta}
        data-offering-id={item.id}
        data-selected={selected ? "true" : undefined}
        className="site-builder-node--services-catalog-cta"
        aria-pressed={selected}
      >
        {label}
      </button>
    </li>
  );
}
