"use client";

import { useEffect, useState } from "react";
import { resolveOfferingCta, type TalentOffering } from "@/lib/talent/offerings-types";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { formatMoney } from "@/lib/talent/offerings-money";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { CatalogBookingSheet, type CatalogSheetBookingSettings } from "@/components/public-booking/CatalogBookingSheet";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import {
  catalogRowCtaLabel,
  catalogRowHasOptions,
  catalogRowMinCents,
  catalogRowShowsFrom,
  type CatalogBookingMode,
} from "@/components/public-booking/catalog-booking-logic";
import { catalogCategoryJumpId, catalogDurationPhrase } from "./services-catalog-title";
import {
  DEFAULT_SHEET_BOOKING_SETTINGS,
  forceRequestIntent,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";

export type CatalogGroup = { name: string | null; items: TalentOffering[]; note?: string | null };

export type CatalogNavMode = "pills" | "tabs" | "jump" | "sections" | "accordion" | "flat";

function detailFor(
  offering: TalentOffering,
  confirmsByHand: boolean,
  bookingPosture: TalentBookingPosture = "on_demand",
): OfferingRequestDetail {
  const raw = resolveOfferingCta(offering);
  const forceRequest = confirmsByHand || forceRequestIntent(bookingPosture);
  const cta = forceRequest && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = !forceRequest && (cta === "book_now" || cta === "buy_now");
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
  bookingPosture: TalentBookingPosture = "on_demand",
) {
  const raw = resolveOfferingCta(offering);
  const forceRequest = confirmsByHand || forceRequestIntent(bookingPosture);
  const cta = forceRequest && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = !forceRequest && (cta === "book_now" || cta === "buy_now");
  const slotEligible =
    cta === "request_to_book" && offering.kind !== "product" && (offering.durationMinutes ?? 0) > 0;
  const eventName =
    instant || (forceRequest && raw !== "ask_quote")
      ? "tulala:offering-instant"
      : slotEligible
        ? "tulala:offering-slot"
        : "tulala:offering-request";
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        ...detailFor(offering, confirmsByHand, bookingPosture),
        startAt,
        inclusion: inclusion ?? undefined,
      },
    }),
  );
}

export function ServicesCatalogFilter({
  groups,
  locale,
  nav,
  showPhoto,
  showDescription = true,
  showCategory = false,
  showDuration,
  showDelivery = false,
  showAvailability = false,
  showPrice = true,
  showUsdEquivalent,
  showBadges = false,
  confirmsByHand,
  usdRates,
  ctaLabel,
  bookingMode = "demo",
  tenantId = null,
  nodeId,
  durationFormat = "auto",
  mobileBar = "float",
  showAskLink = true,
  sheetAccent = "primary",
  categoryShowAll = false,
  categoryShowCounts = false,
  enableCatalogSearch = false,
  captcha = null,
  bookingSettings = DEFAULT_SHEET_BOOKING_SETTINGS,
}: {
  groups: CatalogGroup[];
  locale: string;
  nav: CatalogNavMode;
  showPhoto: boolean;
  showDescription?: boolean;
  showCategory?: boolean;
  showDuration: boolean;
  showDelivery?: boolean;
  showAvailability?: boolean;
  showPrice?: boolean;
  showUsdEquivalent: boolean;
  showBadges?: boolean;
  confirmsByHand: boolean;
  usdRates: UsdRates | null;
  ctaLabel?: string;
  bookingMode?: CatalogBookingMode;
  tenantId?: string | null;
  /** Builder node id — used only for jump-nav fragment ids (serializable). */
  nodeId: string;
  durationFormat?: "auto" | "minutes" | "hours_minutes";
  mobileBar?: "dock" | "float" | "hidden";
  /** Pass-through to sheet; chat handoff owned by sibling sheet/chat PR. */
  showAskLink?: boolean;
  sheetAccent?: "ink" | "primary";
  categoryShowAll?: boolean;
  categoryShowCounts?: boolean;
  enableCatalogSearch?: boolean;
  /** Tenant captcha — required when createInstantBookingAction enforces it. */
  captcha?: GuestCaptchaConfig | null;
  bookingSettings?: CatalogSheetBookingSettings;
}) {
  const named = groups.filter((g) => g.name);
  const first = named[0]?.name ?? null;
  const [active, setActive] = useState<string | null>(categoryShowAll ? null : first);
  const [openAccordion, setOpenAccordion] = useState<string | null>(first);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [selectedBits, setSelectedBits] = useState<string | null>(null);
  const [selectedTotal, setSelectedTotal] = useState(0);
  const [selectedCurrency, setSelectedCurrency] = useState("MXN");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const es = locale.startsWith("es");
  const filterNav = nav === "pills" || nav === "tabs";
  const bookingPosture = bookingSettings.bookingPosture;
  const q = searchQuery.trim().toLowerCase();


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
      dispatchOffering(item, confirmsByHand, undefined, inclusion, bookingPosture);
      return;
    }
    setSelectedId(item.id);
    setSelectedTitle(item.title);
    setSelectedBits(null);
    setSelectedTotal(item.amountCents ?? 0);
    setSelectedCurrency(item.currency);
    dispatchOffering(item, confirmsByHand, "when", inclusion, bookingPosture);
  };

  const continueFromBar = () => {
    const group = groups.find((g) => g.items.some((o) => o.id === selectedId));
    const found = group?.items.find((o) => o.id === selectedId);
    if (!found) return;
    dispatchOffering(found, confirmsByHand, "when", group?.note, bookingPosture);
  };

  const matchesSearch = (item: TalentOffering) => {
    if (!q) return true;
    const hay = `${item.title} ${item.category ?? ""} ${item.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  };

  return (
    <div className="cb-island" data-sheet-accent={sheetAccent}>
      {enableCatalogSearch ? (
        <div className="site-builder-node--services-catalog-search">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={es ? "Buscar servicios…" : "Search services…"}
            aria-label={es ? "Buscar servicios" : "Search services"}
          />
          {q ? (
            <button type="button" onClick={() => setSearchQuery("")}>
              {es ? "Restablecer" : "Reset"}
            </button>
          ) : null}
        </div>
      ) : null}
      {filterNav ? (
        <nav
          aria-label={es ? "Categorías" : "Categories"}
          className="site-builder-node--services-catalog-nav"
          data-category-nav={nav}
        >
          {categoryShowAll ? (
            <button
              type="button"
              aria-pressed={active === null}
              data-catalog-tab="__all__"
              className="site-builder-node--services-catalog-pill"
              data-active={active === null ? "true" : "false"}
              onClick={() => setActive(null)}
            >
              {es ? "Todos" : "All"}
              {categoryShowCounts
                ? ` (${groups.reduce((n, g) => n + g.items.filter(matchesSearch).length, 0)})`
                : ""}
            </button>
          ) : null}
          {named.map((g) => {
            const selected = active === g.name;
            const count = g.items.filter(matchesSearch).length;
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
                {categoryShowCounts ? ` (${count})` : ""}
              </button>
            );
          })}
        </nav>
      ) : nav === "jump" ? (
        <nav
          aria-label={es ? "Categorías" : "Categories"}
          className="site-builder-node--services-catalog-nav"
          data-category-nav="jump"
        >
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
        // Changing filter must not clear selectedId / booking sheet state (brief §7).
        const hidden =
          filterNav && active !== null && Boolean(g.name) && active !== g.name;
        const accordionOpen =
          nav !== "accordion" || openAccordion === g.name || (!g.name && openAccordion === null);
        const showGroupHeading = nav === "jump" || nav === "sections";
        const visibleItems = g.items.filter(matchesSearch);
        return (
          <div
            key={g.name ?? "_"}
            hidden={hidden}
            id={showGroupHeading ? catalogCategoryJumpId(nodeId, g.name ?? "_") : undefined}
            data-catalog-category={g.name ?? "_"}
            className="site-builder-node--services-catalog-group"
          >
            {showGroupHeading ? (
              <h3 className="site-builder-node--services-catalog-group-title">
                {g.name ?? (es ? "Otros" : "Other")}
              </h3>
            ) : null}
            {nav === "accordion" && g.name ? (
              <button
                type="button"
                className="site-builder-node--services-catalog-accordion-trigger"
                aria-expanded={accordionOpen}
                onClick={() => setOpenAccordion(accordionOpen ? null : g.name)}
              >
                <span>{g.name}</span>
                <span aria-hidden>{accordionOpen ? "−" : "+"}</span>
              </button>
            ) : null}
            {nav !== "accordion" || accordionOpen || !g.name ? (
              visibleItems.length === 0 && q ? (
                <p className="site-builder-node--services-catalog-empty">
                  {es ? "Sin resultados." : "No results."}{" "}
                  <button type="button" onClick={() => setSearchQuery("")}>
                    {es ? "Restablecer" : "Reset"}
                  </button>
                </p>
              ) : (
                <ul className="site-builder-node--services-catalog-list">
                  {visibleItems.map((item) => (
                    <CatalogRow
                      key={item.id}
                      item={item}
                      locale={locale}
                      showPhoto={showPhoto}
                      showDescription={showDescription}
                      showCategory={showCategory}
                      showDuration={showDuration}
                      showDelivery={showDelivery}
                      showAvailability={showAvailability}
                      showPrice={showPrice}
                      showUsdEquivalent={showUsdEquivalent}
                      showBadges={showBadges}
                      confirmsByHand={confirmsByHand || forceRequestIntent(bookingPosture)}
                      usdRates={usdRates}
                      ctaLabel={ctaLabel}
                      durationFormat={durationFormat}
                      selected={selectedId === item.id}
                      onSelect={() => onRowAction(item, g.note)}
                    />
                  ))}
                </ul>
              )
            ) : null}
          </div>
        );
      })}

      <div
        className="cb-bar"
        data-show={!sheetOpen && (selectedId !== null || mobileBar !== "hidden")}
        data-has-selection={selectedId !== null}
        data-bar-style={mobileBar}
      >
        <div className="cb-bar-text">
          <strong>{selectedTitle ?? (es ? "Elige tu servicio" : "Choose a service")}</strong>
          <span>
            {selectedId
              ? `${selectedBits ? `${selectedBits} · ` : ""}${formatMoney(selectedTotal, selectedCurrency, locale)}`
              : es
                ? "Del menú completo, con sus opciones"
                : "From the full menu, with its options"}
          </span>
        </div>
        {selectedId ? (
          <button type="button" onClick={continueFromBar}>
            {es ? "Continuar" : "Continue"}
          </button>
        ) : null}
      </div>

      {/* showAsk flag only — chat handoff serialization owned by sibling sheet/chat PR */}
      <CatalogBookingSheet
        locale={locale}
        mode={bookingMode}
        tenantId={tenantId}
        showAsk={showAskLink}
        captcha={captcha}
        bookingSettings={bookingSettings}
      />
    </div>
  );
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
  confirmsByHand,
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
  confirmsByHand: boolean;
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
  const raw = resolveOfferingCta(item);
  const cta = confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const label = catalogRowCtaLabel({
    selected,
    offering: item,
    locale,
    inspectorLabel: selected ? undefined : ctaLabel,
  });
  const where = Array.isArray(item.attributes?.where)
    ? (item.attributes.where as string[])
    : [];
  const whereLabels: Record<string, string> = es
    ? { studio: "En el estudio", client: "A domicilio", remote: "Remoto", agreed: "A convenir" }
    : { studio: "At studio", client: "At client", remote: "Remote", agreed: "By agreement" };
  const deliveryText = where.map((w) => whereLabels[w] ?? w).filter(Boolean).join(" · ");
  const badges: string[] = [];
  if (showBadges) {
    if (item.bookingMode === "instant") badges.push(es ? "Reserva inmediata" : "Instant booking");
    if (item.reserveMode === "deposit") badges.push(es ? "Seña" : "Deposit required");
    if (where.includes("remote")) badges.push(es ? "En línea" : "Online session");
  }
  return (
    <li className="site-builder-node--services-catalog-row" data-selected={selected ? "true" : undefined}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="site-builder-node--services-catalog-photo" />
      ) : showPhoto ? (
        <span className="site-builder-node--services-catalog-photo" aria-hidden />
      ) : null}
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
          <span className="site-builder-node--services-catalog-meta">{item.category}</span>
        ) : null}
        {showDescription && item.description ? (
          <span className="site-builder-node--services-catalog-desc">{item.description}</span>
        ) : null}
        {showDuration && item.durationMinutes && item.kind !== "product" ? (
          <span className="site-builder-node--services-catalog-duration">
            {catalogDurationPhrase(item.durationMinutes, locale, durationFormat)}
          </span>
        ) : null}
        {showDelivery && deliveryText ? (
          <span className="site-builder-node--services-catalog-meta">{deliveryText}</span>
        ) : null}
        {showAvailability ? (
          <span className="site-builder-node--services-catalog-meta">
            {item.bookingMode === "instant"
              ? es
                ? "Confirmación inmediata"
                : "Instant confirmation"
              : es
                ? "Sujeto a confirmación"
                : "Subject to confirmation"}
          </span>
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
      {showPrice ? (
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
