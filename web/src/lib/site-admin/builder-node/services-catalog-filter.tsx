"use client";

import { intakeDetail } from "@/lib/talent/offering-intake";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { formatMoney } from "@/lib/talent/offerings-money";
import { formatOfferingWhereLabel, offeringWhereFromAttributes, type OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { BookingSheetReadyBeacon } from "@/components/public-booking/BookingSheetReadyBeacon";
import { CatalogBookingSheet, type CatalogSheetBookingSettings } from "@/components/public-booking/CatalogBookingSheet";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import {
  catalogRowCtaLabel,
  offeringPriceUnit,
  catalogRowMinCents,
  catalogRowOpensSheetImmediately,
  catalogRowShowsFrom,
  type CatalogBookingMode,
} from "@/components/public-booking/catalog-booking-logic";
import { CatalogPurchaseMount } from "@/components/public-booking/CatalogPurchaseMount";
import { catalogBarPriceLabel, catalogRowPriceText } from "./services-catalog-bar-price";
import { ServicesCatalogDemoToast, useDemoToast } from "./services-catalog-demo-toast";
import { catalogDurationShort, railCount } from "./services-catalog-format";
import { CatalogIdleBarGo, CatalogIdleBarText, CatalogOverlayStyles } from "./services-catalog-idle-bar";
import { CatalogMatrix } from "./services-catalog-matrix";
import type { LiveStatusRenderContext } from "@/lib/talent/live-status-render";
import { ChatIcon, SelectionDock } from "@/components/public-booking/SelectionDock";
import {
  EMPTY_DOCK,
  dockPickSwitches,
  dockReducer,
} from "@/components/public-booking/selection-dock-state";
import { openCatalogBookingChat } from "@/components/public-booking/catalog-booking-chat";
import { useChatAddService } from "@/components/public-booking/use-chat-add-service";
import { useDockBookingResume } from "@/components/public-booking/use-dock-booking-resume";
import { useDockToast } from "@/components/public-booking/use-dock-toast";
import { useStickyBarProps } from "./use-sticky-bar-visible";
import { catalogCategoryJumpId, catalogDurationPhrase } from "./services-catalog-title";
import { dispatchCatalogOffering } from "./catalog-offering-dispatch";
import {
  catalogCtaTabIndex,
  focusCatalogDockContinue,
} from "./catalog-keyboard";
import { CatalogRow } from "./services-catalog-row";
import {
  DEFAULT_SHEET_BOOKING_SETTINGS,
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";

export type CatalogGroup = { name: string | null; label?: string | null; items: TalentOffering[]; note?: string | null };

export type CatalogNavMode = "pills" | "tabs" | "rail" | "jump" | "sections" | "accordion" | "flat";

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

function dispatchOffering(
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
  showModeChip = false,
  priceInMeta = false,
  rowCard = false,
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
  onlineCollectReady,
  matrix = false,
  liveStatus = null,
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
  showModeChip?: boolean;
  /** Price inline after the duration (Maison v2 rows), not in the buy column. */
  priceInMeta?: boolean;
  /** `rowStyle: "card"`: the whole row opens the service, the photo gets a clipped thumb wrapper. */
  rowCard?: boolean;
  confirmsByHand: boolean;
  usdRates: UsdRates | null;
  ctaLabel?: string;
  bookingMode?: CatalogBookingMode;
  tenantId?: string | null;
  /** Builder node id — used only for jump-nav fragment ids (serializable). */
  nodeId: string;
  durationFormat?: "auto" | "minutes" | "hours_minutes";
  mobileBar?: "dock" | "float" | "pill" | "hidden";
  /** Pass-through to sheet; chat handoff owned by sibling sheet/chat PR. */
  showAskLink?: boolean;
  sheetAccent?: "ink" | "primary";
  categoryShowAll?: boolean;
  categoryShowCounts?: boolean;
  enableCatalogSearch?: boolean;
  /** Tenant captcha — required when createInstantBookingAction enforces it. */
  captcha?: GuestCaptchaConfig | null;
  bookingSettings?: CatalogSheetBookingSettings;
  /** PAY-2 B — platform Checkout ready; omit → sheet default true. */
  onlineCollectReady?: boolean;
  /** layout "matrix": one comparison table (wide) / stacked cards (narrow). */
  matrix?: boolean;
  liveStatus?: LiveStatusRenderContext | null;
}) {
  const named = groups.filter((g) => g.name);
  const first = named[0]?.name ?? null;
  const [active, setActive] = useState<string | null>(categoryShowAll ? null : first);
  const [openAccordion, setOpenAccordion] = useState<string | null>(first);
  const [dock, dispatchDock] = useReducer(dockReducer, EMPTY_DOCK); // AUD-044 multi-select dock state (front = first picked)
  const { toast, showToast, clearToast } = useDockToast();
  const selectedId = dock.picked[0]?.id ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const barProps = useStickyBarProps(nodeId, sheetOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const demoToast = useDemoToast(bookingMode === "demo");
  const es = locale.startsWith("es");
  const filterNav = nav === "pills" || nav === "tabs" || nav === "rail";
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
      dispatchDock({
        type: "upsert",
        pick: {
          id: d.offeringId,
          bits: d.detail ?? null,
          totalCents: d.totalCents ?? 0,
          currency: d.currency ?? "MXN",
        },
      });
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
    demoToast.ping();
    // Option / consult rows open the sheet; plain Seleccionar → dock Continuar.
    if (catalogRowOpensSheetImmediately(item)) {
      dispatchOffering(item, confirmsByHand, undefined, inclusion, bookingPosture);
      return;
    }
    const switching = dockPickSwitches(dock, item.id);
    const wasPicked = dock.picked.some((p) => p.id === item.id);
    dispatchDock({
      type: "toggle",
      pick: {
        id: item.id,
        bits: null,
        totalCents: item.amountCents ?? 0,
        currency: item.currency,
        priceLabel: catalogBarPriceLabel(item, locale),
      },
    });
    if (switching) showToast({ kind: "switched", name: item.title });
    else if (!wasPicked) showToast({ kind: "added", name: item.title });
    else clearToast();
    // TUL-534: after select, focus Continuar so Enter opens the sheet (≤10 Tabs).
    if (!wasPicked || switching) focusCatalogDockContinue();
  };

  // First bookable row CTA is the sole Tab stop until a row is selected (roving).
  const firstCtaId =
    groups.flatMap((g) => g.items).find((o) => !deriveFor(o, confirmsByHand, bookingPosture).hidden)?.id ??
    null;

  const findOffering = (id: string | null) => {
    const group = groups.find((g) => g.items.some((o) => o.id === id));
    return { group, found: group?.items.find((o) => o.id === id) ?? null };
  };

  // CH-4: the card chat's in-chat service list asks for a service, exactly like
  // tapping its row (select, or open the sheet when it has options). A service
  // that is already picked stays as it is.
  useChatAddService((id) => {
    const { found } = findOffering(id);
    if (found && !dock.picked.some((p) => p.id === found.id)) onRowAction(found);
  });

  const continueFromBar = () => {
    const { group, found } = findOffering(selectedId);
    if (!found) return;
    dispatchOffering(found, confirmsByHand, "when", group?.note, bookingPosture);
  };

  const dockItems = dock.picked.flatMap((p) => {
    const { found } = findOffering(p.id);
    if (!found) return [];
    return [
      {
        id: p.id,
        title: found.title,
        imageUrl: found.imageUrls[0] ?? null,
        bits: p.bits,
        totalCents: p.totalCents,
        priceLabel: p.priceLabel ?? null,
      },
    ];
  });
  const dockCurrency = dock.picked[0]?.currency ?? "MXN";
  // CH-3: a service picked here (sheet never opened) still gets "Volver a mi reserva" in the chat.
  const front = dockItems[0];
  useDockBookingResume(front ? { title: front.title, totalCents: front.totalCents, priceLabel: front.priceLabel, currency: dockCurrency } : null, continueFromBar);


  const removeFront = () => {
    const front = dockItems[0];
    if (!front) return;
    dispatchDock({ type: "remove_front" });
    showToast({ kind: "removed", name: front.title });
  };

  const undoRemove = () => {
    dispatchDock({ type: "undo" });
    clearToast();
  };

  const askFromDock = () => {
    const { found } = findOffering(selectedId);
    if (!found) return;
    const front = dock.picked[0];
    openCatalogBookingChat({
      detail: detailFor(found, confirmsByHand, bookingPosture),
      selection: front
        ? {
            variantLabel: front.bits,
            totalCents: dock.picked.reduce((s, p) => s + p.totalCents, 0),
          }
        : undefined,
      from: "dock",
      askAbout: dockItems.map((i) => i.title),
      demo: bookingMode === "demo",
    });
  };

  const matchesSearch = (item: TalentOffering) => {
    if (!q) return true;
    const hay = `${item.title} ${item.category ?? ""} ${item.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  };

  return (
    <div className="cb-island" data-sheet-accent={sheetAccent} data-booking-mode={bookingMode}>
      {bookingMode === "demo" ? <ServicesCatalogDemoToast show={demoToast.show} locale={locale} /> : null}
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
      <div
        className="site-builder-node--services-catalog-body"
        data-category-nav={filterNav || nav === "jump" ? nav : undefined}
      >
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
              {nav === "rail" ? (es ? "Todo" : "All") : es ? "Todos" : "All"}
              {categoryShowCounts
                ? railCount(nav, groups.reduce((n, g) => n + g.items.filter(matchesSearch).length, 0))
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
                {g.label ?? g.name}
                {categoryShowCounts ? railCount(nav, count) : ""}
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
              {g.label ?? g.name ?? (es ? "Otros" : "Other")}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="site-builder-node--services-catalog-groups">
      {matrix ? <CatalogMatrix items={groups.flatMap((g) => g.items.filter(matchesSearch))} locale={locale} confirmsByHand={confirmsByHand} bookingPosture={bookingPosture} ctaLabel={ctaLabel} liveStatus={liveStatus} selectedIds={dock.picked.map((p) => p.id)} rovingAnchorId={firstCtaId} onSelect={(item) => onRowAction(item)} /> : groups.map((g) => {
        // Changing filter must not clear selectedId / booking sheet state (brief §7).
        const hidden =
          filterNav && active !== null && Boolean(g.name) && active !== g.name;
        const accordionOpen =
          nav !== "accordion" || openAccordion === g.name || (!g.name && openAccordion === null);
        const showGroupHeading = nav === "jump" || nav === "sections" || nav === "rail";
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
                {g.label ?? g.name ?? (es ? "Otros" : "Other")}
                {nav === "rail" ? (
                  <small className="site-builder-node--services-catalog-group-count">
                    {es
                      ? `${visibleItems.length} ${visibleItems.length === 1 ? "servicio" : "servicios"}`
                      : `${visibleItems.length} ${visibleItems.length === 1 ? "service" : "services"}`}
                  </small>
                ) : null}
              </h3>
            ) : null}
            {nav === "accordion" && g.name ? (
              <button
                type="button"
                className="site-builder-node--services-catalog-accordion-trigger"
                aria-expanded={accordionOpen}
                onClick={() => setOpenAccordion(accordionOpen ? null : g.name)}
              >
                <span>{g.label ?? g.name}</span>
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
                      showModeChip={showModeChip}
                      priceInMeta={priceInMeta}
                      rowCard={rowCard}
                      confirmsByHand={confirmsByHand}
                      bookingPosture={bookingPosture}
                      usdRates={usdRates}
                      ctaLabel={ctaLabel}
                      durationFormat={durationFormat}
                      selected={dock.picked.some((p) => p.id === item.id)}
                      ctaTabIndex={catalogCtaTabIndex({
                        selected: dock.picked.some((p) => p.id === item.id),
                        rovingAnchor: selectedId === null && item.id === firstCtaId,
                      })}
                      onSelect={() => onRowAction(item, g.note)}
                    />
                  ))}
                </ul>
              )
            ) : null}
          </div>
        );
      })}
      </div>
      </div>

      <CatalogOverlayStyles /> {/* The bar below is the idle prompt only; once something is picked the AUD-044 dock takes over. */}
      <div
        {...barProps}
        className="cb-bar"
        data-show={!sheetOpen && selectedId === null && mobileBar !== "hidden"}
        data-has-selection="false"
        data-bar-style={mobileBar}
      >
        {mobileBar === "pill" ? (
          <>
            <button
              type="button"
              className="cb-bar-chat"
              aria-label={es ? "Abrir el chat" : "Open the chat"}
              onClick={() => window.dispatchEvent(new CustomEvent("tulala:open-guest-chat"))}
            >
              <ChatIcon size={20} />
            </button>
            <CatalogIdleBarGo
              nodeId={nodeId}
              es={es}
              groups={groups}
              settings={{ confirmsByHand, bookingPosture }}
              buildDetail={(o) => detailFor(o, confirmsByHand, bookingPosture)}
            />
          </>
        ) : (
          <CatalogIdleBarText
            nodeId={nodeId}
            es={es}
            groups={groups}
            settings={{ confirmsByHand, bookingPosture }}
            buildDetail={(o) => detailFor(o, confirmsByHand, bookingPosture)}
          />
        )}
      </div>

      <SelectionDock
        items={dockItems}
        show={!sheetOpen}
        locale={locale}
        formatPrice={(c) => formatMoney(c, dockCurrency, locale)}
        onRemoveFront={removeFront}
        onAsk={askFromDock}
        onContinue={continueFromBar}
        toast={toast}
        onUndo={undoRemove}
        liveStatus={liveStatus}
      />

      {/* showAsk flag only — chat handoff serialization owned by sibling sheet/chat PR */}
      <CatalogBookingSheet
        locale={locale}
        mode={bookingMode}
        tenantId={tenantId}
        showAsk={showAskLink}
        captcha={captcha}
        bookingSettings={bookingSettings}
        onlineCollectReady={onlineCollectReady}
      />
      <BookingSheetReadyBeacon />
      {/* PKG-2 Option A: product / untimed-package purchase rail (demo = non-writing preview). */}
      <CatalogPurchaseMount
        tenantId={tenantId}
        locale={locale}
        captcha={captcha}
        mode={bookingMode}
        onlineCollectReady={onlineCollectReady}
      />
    </div>
  );
}

export { CatalogRow } from "./services-catalog-row";
