"use client";

/**
 * ticket_picker — the guest buys a ticket (E5 step 4, card or pay-at-door).
 *
 * THE ONE RULE: this block never renders a buy control it cannot complete.
 * It shows exactly one of a WORKING purchase (a scheduled night, a tier on
 * sale with a pool on that night, the card hop live) or an HONEST state that
 * names why not: `not_configured` (empty tenant or event), no night
 * scheduled, not on sale, sold out. "Sold out" is the reserve's answer after
 * the click, shown as a state — never a dead button.
 *
 * Self-fetch class like `session_picker` (CEO ruling): tenant and event from
 * props, data through dynamically imported server actions. Empty props render
 * `not_configured` and never call an action — the schema would refuse them
 * anyway; the point is that the AUTHOR sees "not configured", not an outage.
 * Dynamic import is required so fidelity/perf (which import this island via
 * `render.tsx`) do not pull `server-only` purchase modules into Node.
 * The dedicated `/events/<slug>` page also server-seeds `preload` so first
 * paint is not a client round-trip.
 *
 * v3 (LUMINA audit, 2026-09-17). Two layouts:
 *   • `layout: "cards"` — the tier cards are INLINE at every width with their
 *     price, badge, "includes", coarse availability and an inline stepper;
 *     an order bar (fixed on a phone, a sticky rail on desktop) appears as
 *     soon as a quantity is above zero; "Continue", a deep link
 *     (`?tier=<uuid|slug>`) or the floating "Buy tickets" pill opens the
 *     checkout sheet / drawer (details + summary + pay). `presentation` no
 *     longer changes this: "sheet" used to hide every tier behind one pill,
 *     which is the defect the owner audited.
 *   • `layout: "list"` (default, the `/events/<slug>` page) — the v1 single
 *     screen: night radio, tier radio, fields, one buy button. Unchanged.
 *
 * Chrome uses the tenant's projected `--token-color-*` roles. No parallel
 * palette. Availability is three words from the pool, never a count
 * (Capacity ruling); the reserve at checkout is the answer that binds.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";
import { afterTicketPurchaseSuccess } from "@/lib/events/ticket-purchase";
import { TierCards } from "./ticket-picker-cards";
import { CheckoutSheet } from "./ticket-picker-checkout";
import { COPY, UUID, formatWhen, money, newOrderKey, pickLocale } from "./ticket-picker-copy";
import { TP_CSS } from "./ticket-picker-css";
import { FloatingCta } from "./ticket-picker-floating-cta";
import { DetailsFields, SeatsSection, Stepper, buyLabel, type DetailsState } from "./ticket-picker-form";
import {
  autoNight, checkoutTierFor, isValidEmail, maxUnits, orderTotalCents, tierAvailability, tierFromQuery, tierMatchesRef, tierRefKind, visibleTiers,
  type TierPresentation,
} from "./ticket-picker-steps";

export interface TicketPickerIslandProps {
  tenantId: string;
  eventId: string;
  title?: string;
  locale?: string;
  /**
   * Kept on the schema for every page that authored it. Since v3 the cards
   * layout always shows its tiers inline and always checks out in the sheet /
   * drawer, so "inline" and "sheet" render the same thing.
   */
  presentation?: "inline" | "sheet";
  /** `cards` = v3 tier cards + order bar + checkout; `list` (default) = the v1 single screen. */
  layout?: "cards" | "list";
  tiers?: ReadonlyArray<TierPresentation> | null;
  /** `auto` (default for cards) hides the night picker when only one night is sellable. */
  showNightPicker?: "auto" | "always";
  /** The one-tap label ("Comprar entradas"): the floating pill and the order bar's control. */
  ctaLabel?: string;
  /**
   * TEST-ONLY: seed the loaded state so a static render (the Creative
   * Director's file review) shows a real state instead of "loading". Never
   * set on a live page; when set, no action is called.
   */
  preload?: { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[]; ageGate?: number | null } | null;
}

type Loaded = { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[]; ageGate: number | null };

export function TicketPickerIsland({ tenantId, eventId, title, locale, preload, layout, tiers: tierPresentation, showNightPicker, ctaLabel: ctaOverride }: TicketPickerIslandProps) {
  const loc = pickLocale(locale);
  const t = (key: string) => COPY[loc][key] ?? COPY.en[key] ?? key;
  // NOT CONFIGURED is decided here, before any action: an author who dropped
  // the block with no event sees why, not an outage.
  const configured = UUID.test(tenantId) && UUID.test(eventId);
  const cards = layout === "cards";

  // The deep link: `/page?tier=<variantId|tierKey>`. Read once, synchronously,
  // so the first load already asks the loader for a hidden tier by that ref.
  const [queryTier] = useState<string | null>(() => (typeof window === "undefined" ? null : tierFromQuery(window.location.search)));

  const [data, setData] = useState<Loaded | null>(preload ? { ...preload, ageGate: preload.ageGate ?? null } : null);
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [night, setNight] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [qty, setQty] = useState(cards ? 0 : 1);
  const [details, setDetails] = useState<DetailsState>({ email: "", name: "", phone: "", promo: "", payHow: "full", ageOk: false });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [orderKey, setOrderKey] = useState(() => newOrderKey());
  const [busy, setBusy] = useState<"idle" | "holding" | "redirecting">("idle");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [held, setHeld] = useState<{ receiptCode: string | null } | null>(null);
  const [pickedSeats, setPickedSeats] = useState<string[]>([]);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  /** The hold rows behind `holdUntil`; travel with the purchase (A5). */
  const [holdIds, setHoldIds] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const deepLinked = useRef(false);
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const patchDetails = (patch: Partial<DetailsState>) => {
    setDetails((prev) => ({ ...prev, ...patch }));
    if (patch.email !== undefined) setEmailError(null);
    if (patch.ageOk !== undefined) setRefusal(null);
  };

  const load = useCallback(async () => {
    if (!configured || preload) return;
    try {
      const { loadTicketPicker } = await import("@/app/(public)/_events/ticket-picker-actions");
      const refKind = tierRefKind(queryTier);
      const res = await loadTicketPicker({
        tenantId, eventId,
        ...(refKind === "id" ? { includeVariantId: queryTier } : refKind === "key" ? { includeTierKey: queryTier } : {}),
      });
      if (res.ok) { setData({ eventTitle: res.eventTitle, currency: res.currency, timeZone: res.timeZone, tiers: res.tiers, nights: res.nights, ageGate: res.ageGate }); setLoadRefusal(null); }
      else { setData(null); setLoadRefusal(t(res.reason)); }
    } catch { setData(null); setLoadRefusal(t("unavailable")); }
  }, [configured, preload, tenantId, eventId, loc, queryTier]);
  useEffect(() => { void load(); }, [load]);

  // One sellable night is implied (auto) so the guest never picks the obvious.
  // v1 pages always showed the night radio; cards imply the one night.
  const nightMode = showNightPicker ?? (cards ? "auto" : "always");
  const impliedNight = useMemo(() => (data ? autoNight(data.nights, data.tiers, nightMode) : null), [data, nightMode]);
  useEffect(() => { if (impliedNight && night === null) setNight(impliedNight); }, [impliedNight, night]);

  const chosenNight = useMemo(() => data?.nights.find((n) => n.sessionId === night) ?? null, [data, night]);
  useEffect(() => {
    setPickedSeats([]);
    setHoldUntil(null);
    setHoldIds([]);
  }, [night]);
  // A tier is offered for a night ONLY when it is on sale AND has a pool on
  // that night. Anything else is not a choice, so it is not a control.
  const offeredTiers = useMemo(
    () => (data && chosenNight ? visibleTiers(data.tiers.filter((x) => x.onSale && chosenNight.sellableVariantIds.includes(x.variantId)), tierPresentation, queryTier) : []),
    [data, chosenNight, tierPresentation, queryTier],
  );
  const availabilityOf = useCallback((variantId: string) => tierAvailability(chosenNight, variantId), [chosenNight]);

  // The deep link pre-selects its tier (one unit, or the tier's minimum) and,
  // on the cards layout, scrolls here and opens the checkout. Once.
  useEffect(() => {
    if (!queryTier || deepLinked.current || tier !== null) return;
    const x = offeredTiers.find((y) => tierMatchesRef(y, queryTier));
    if (!x) return;
    deepLinked.current = true;
    setTier(x.variantId); setQty(Math.max(1, x.minPerOrder));
    if (cards) {
      setCheckoutOpen(true);
      rootRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, [queryTier, tier, offeredTiers, cards]);

  const chosenTier = offeredTiers.find((x) => x.variantId === tier) ?? null;
  // The strictest minimum that applies to what is actually selected. Computed
  // the same way the server computes it, and shown for the same reason the
  // server refuses without it: a gate nobody is asked about is decoration.
  const ageGate = Math.max(data?.ageGate ?? 0, chosenTier?.ageGate ?? 0) || null;
  const canBuy = Boolean(chosenNight && chosenTier) && qty >= 1 && (!ageGate || details.ageOk) && busy === "idle";
  const showQty = Boolean(chosenTier && (chosenTier.minPerOrder !== 1 || chosenTier.maxPerOrder !== 1));
  const totalCents = orderTotalCents(chosenTier, qty);

  async function holdSeats() {
    if (!chosenNight || pickedSeats.length === 0 || busy !== "idle") return;
    setBusy("holding");
    setRefusal(null);
    try {
      const { holdTicketSeats } = await import("@/app/(public)/_events/ticket-picker-actions");
      const res = await holdTicketSeats({
        tenantId,
        eventId,
        sessionId: chosenNight.sessionId,
        seatIds: pickedSeats,
        operationKey: crypto.randomUUID(),
      });
      if (!res.ok) {
        setRefusal(t(res.reason === "invalid_request" ? "invalid_request" : res.reason));
        setBusy("idle");
        return;
      }
      setHoldUntil(res.expiresAt);
      setHoldIds(res.ids);
    } catch {
      setRefusal(t("unavailable"));
    }
    setBusy("idle");
  }

  async function buy() {
    if (!chosenNight || !chosenTier || busy !== "idle" || qty < 1) return;
    const email = details.email.trim();
    if (!email) { setEmailError(t("emailRequired")); return; }
    if (!isValidEmail(email)) { setEmailError(t("emailInvalid")); return; }
    setBusy("holding"); setRefusal(null); setEmailError(null);
    try {
      const { startTicketPurchase, startTicketCardPayment } = await import("@/app/(public)/_events/ticket-picker-actions");
      const choice = chosenNight.door.offered ? details.payHow : "full";
      const res = await startTicketPurchase({
        tenantId, eventId, sessionId: chosenNight.sessionId, variantId: chosenTier.variantId, units: qty,
        email, displayName: details.name.trim() || undefined, phone: details.phone.trim() || undefined,
        promoCode: details.promo.trim() || undefined, clientOrderKey: orderKey, paymentChoice: choice, locale: loc,
        // Sent only when a gate applies AND the box is ticked. The server
        // refuses a gated basket that arrives without it, so an unticked box is
        // a refusal there rather than a silent sale here.
        confirmedAge: ageGate && details.ageOk ? ageGate : undefined,
        // The seats this guest holds ride along; the order consumes them.
        holdIds: holdIds.length > 0 ? holdIds : undefined,
      });
      if (!res.ok) {
        setRefusal(t(res.reason === "quantity" ? "quantity_err" : res.reason));
        if (res.reason === "seat_taken" || res.reason === "hold_expired") {
          setHoldUntil(null);
          setHoldIds([]);
          setPickedSeats([]);
        }
        setOrderKey(newOrderKey()); // a NEW cart after a refusal
        void load(); // seats moved under us; the list on screen may now be a lie
        setBusy("idle");
        return;
      }
      const next = afterTicketPurchaseSuccess(res);
      if (next === "held") {
        // Seats held until the night ends; no card, no transaction. The receipt
        // shows the amount due and no QR until it is settled at the door.
        setHeld({ receiptCode: res.receiptCode });
        setCheckoutOpen(false);
        setBusy("idle");
        return;
      }
      if (next === "receipt" && res.receiptCode) {
        window.location.assign(`/r/${res.receiptCode}`);
        return;
      }
      if (next !== "card" || !res.transactionId) {
        setRefusal(t("engine_error"));
        setOrderKey(newOrderKey());
        setBusy("idle");
        return;
      }
      setBusy("redirecting");
      const pay = await startTicketCardPayment({ tenantId, orderId: res.orderId, transactionId: res.transactionId, locale: loc });
      if (!pay.ok) { setRefusal(t(pay.reason)); setBusy("idle"); return; }
      window.location.assign(pay.url);
    } catch {
      setRefusal(t("engine_error")); setOrderKey(newOrderKey()); setBusy("idle");
    }
  }

  const doorSentence = (n: PickerNight): string | null =>
    n.door.offered ? t("door_offered")
    : n.door.reason === "opens_closer_to_date" ? t("door_opens_closer")
    : n.door.reason === "doors_open" ? t("door_doors_open")
    : null;

  const chrome = (state: string, children: ReactNode) => (
    <div ref={rootRef} data-ticket-picker={state} data-tp-layout={cards ? "cards" : "list"} data-tp-checkout-open={checkoutOpen ? "1" : undefined}>
      <style>{TP_CSS}</style>
      {children}
    </div>
  );

  if (!configured) return chrome("not_configured", <p className="tp-status">{t("not_configured")}</p>);
  if (held) {
    return chrome("held", (
      <div className="tp-held">
        <b>{t("heldTitle")}</b>
        <p className="tp-status">
          {t("heldDoor")}{" "}
          {held.receiptCode ? <a href={`/r/${held.receiptCode}`}>/r/{held.receiptCode}</a> : null}
        </p>
      </div>
    ));
  }

  const isBusy = busy !== "idle";
  const oneTap = ctaOverride ?? t("openSheet");
  const totalLabel = data ? money(totalCents, data.currency, loc, t("free")) : null;
  const finalLabel = buyLabel({ t, busy, door: Boolean(chosenNight?.door.offered), payHow: details.payHow, tier: chosenTier, totalLabel: cards ? totalLabel : null, override: cards ? undefined : ctaOverride });

  const openCheckout = () => { setRefusal(null); setCheckoutOpen(true); };
  const closeCheckout = () => setCheckoutOpen(false);
  const toggleSeat = (seatId: string, on: boolean) => setPickedSeats((prev) => (on ? prev.filter((id) => id !== seatId) : [...prev, seatId]));

  const nightPicker = data && data.nights.length > 0 && (!impliedNight || nightMode === "always") ? (
    <div className="tp-section" role="radiogroup" aria-label={t("night")}>
      <div className="tp-label">{t("night")}</div>
      <div className="tp-choices">
        {data.nights.map((n) => {
          const sellable = n.sellableVariantIds.some((id) => data.tiers.find((x) => x.variantId === id)?.onSale);
          const ds = doorSentence(n);
          const on = night === n.sessionId;
          return (
            <label key={n.sessionId} className="tp-choice" data-on={on ? "1" : undefined} data-off={sellable ? undefined : "1"}>
              <input
                className="tp-radio"
                type="radio"
                name="night"
                value={n.sessionId}
                disabled={!sellable}
                checked={on}
                onChange={() => { setNight(n.sessionId); setTier(null); setQty(cards ? 0 : 1); setRefusal(null); setCheckoutOpen(false); }}
              />
              <span className="tp-choice-copy">
                <span className="tp-choice-title">{formatWhen(n.startsAt, data.timeZone, loc)}</span>
                {!sellable ? <span className="tp-choice-meta">{t("noTiers")}</span> : null}
                {ds ? <span className="tp-choice-meta">{ds}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  ) : null;

  const seatsSection = chosenNight ? (
    <SeatsSection t={t} night={chosenNight} pickedSeats={pickedSeats} busy={isBusy} holdUntil={holdUntil} onToggle={toggleSeat} onHold={() => void holdSeats()} />
  ) : null;

  // ── Legacy single screen (layout "list"): the v1 contract. ─────────────
  const legacyTierList = data && chosenNight ? (
    offeredTiers.length === 0 ? (
      <p className="tp-status" data-ticket-picker="no_tiers">{t("noTiers")}</p>
    ) : (
      <div className="tp-section" role="radiogroup" aria-label={t("tier")}>
        <div className="tp-label">{t("tier")}</div>
        <div className="tp-choices">
          {offeredTiers.map((x) => {
            const on = tier === x.variantId;
            const price = money(x.amountCents, data.currency, loc, t("free"));
            return (
              <label key={x.variantId} className="tp-choice" data-on={on ? "1" : undefined}>
                <input className="tp-radio" type="radio" name="tier" value={x.variantId} checked={on} onChange={() => { setTier(x.variantId); setQty(Math.max(1, x.minPerOrder)); setRefusal(null); patchDetails({ ageOk: false }); }} />
                <span className="tp-choice-copy">
                  <span className="tp-choice-title">{x.label}</span>
                  {x.admitsPerUnit > 1 ? <span className="tp-choice-meta">{t("admits").replace("{n}", String(x.admitsPerUnit))}</span> : null}
                  {x.includes.length > 0 ? <span className="tp-choice-meta">{x.includes.join(" · ")}</span> : null}
                </span>
                <span className="tp-price" data-free={x.amountCents === 0 ? "1" : undefined}>{price}</span>
              </label>
            );
          })}
        </div>
      </div>
    )
  ) : null;

  const singleScreen = (
    <>
      {nightPicker}
      {legacyTierList}
      {seatsSection}
      {chosenTier ? (
        <div className="tp-fields">
          {showQty ? (
            <div>
              <div className="tp-field-label">{t("quantity")}</div>
              <Stepper t={t} qty={qty} min={chosenTier.minPerOrder} max={maxUnits(chosenTier)} busy={isBusy} onChange={setQty} />
            </div>
          ) : null}
          <DetailsFields t={t} state={details} onChange={patchDetails} busy={isBusy} emailError={emailError} showPhone={false} doorOffered={Boolean(chosenNight?.door.offered)} ageGate={ageGate} />
          <button type="button" className="tp-cta" onClick={() => void buy()} disabled={!canBuy}>{finalLabel}</button>
        </div>
      ) : null}
    </>
  );

  // ── v3 cards: inline tiers + order bar + checkout sheet + floating pill. ─
  const hasOrder = Boolean(chosenTier) && qty > 0;
  const orderBar = data ? (
    <aside className="tp-bar" data-empty={hasOrder ? undefined : "1"} data-testid="ticket-order-bar" aria-label={t("yourOrder")}>
      <p className="tp-bar-head">{t("yourOrder")}</p>
      {hasOrder && chosenTier ? (
        <>
          <div className="tp-bar-lines">
            <div className="tp-bar-line"><span>{qty} × {chosenTier.label}</span><span>{money(chosenTier.amountCents * qty, data.currency, loc, t("free"))}</span></div>
            {chosenTier.admitsPerUnit > 1 ? <div className="tp-bar-line" data-sub="1"><span>{t("admits").replace("{n}", String(chosenTier.admitsPerUnit * qty))}</span></div> : null}
            <div className="tp-bar-total" aria-live="polite">{t("total")}<b>{totalLabel}</b></div>
          </div>
          <button type="button" className="tp-cta" data-testid="ticket-open-sheet" onClick={openCheckout} disabled={isBusy}>{t("continue")}</button>
        </>
      ) : (
        <p className="tp-bar-empty">{t("emptyOrder")}</p>
      )}
    </aside>
  ) : null;

  const cardsScreen = data ? (
    <>
      <div className="tp-shop" data-has-order={hasOrder ? "1" : undefined}>
        <div className="tp-main">
          {nightPicker}
          {chosenNight ? (
            offeredTiers.length === 0 ? (
              <p className="tp-status" data-ticket-picker="no_tiers">{t("noTiers")}</p>
            ) : (
              <TierCards
                t={t}
                loc={loc}
                currency={data.currency}
                tiers={offeredTiers}
                chosenId={tier}
                qty={qty}
                busy={isBusy}
                queryTier={queryTier}
                availabilityOf={availabilityOf}
                onQty={(x, next) => {
                  setRefusal(null);
                  if (next <= 0) { if (tier === x.variantId) { setTier(null); setQty(0); } return; }
                  if (tier !== x.variantId) patchDetails({ ageOk: false });
                  setTier(x.variantId); setQty(next);
                }}
              />
            )
          ) : null}
        </div>
        {orderBar}
      </div>
      {checkoutOpen && chosenNight && chosenTier && hasOrder ? (
        <CheckoutSheet
          t={t}
          loc={loc}
          title={title ?? data.eventTitle}
          currency={data.currency}
          timeZone={data.timeZone}
          night={chosenNight}
          tier={chosenTier}
          qty={qty}
          stage={isBusy ? "pay" : "details"}
          details={details}
          onDetails={patchDetails}
          emailError={emailError}
          ageGate={ageGate}
          busy={isBusy}
          refusal={refusal}
          canBuy={canBuy}
          ctaLabel={finalLabel}
          pickedSeats={pickedSeats}
          holdUntil={holdUntil}
          onToggleSeat={toggleSeat}
          onHoldSeats={() => void holdSeats()}
          onBuy={() => void buy()}
          onClose={closeCheckout}
          onEditOrder={closeCheckout}
          titleId={`${titleId}-sheet`}
        />
      ) : null}
      <FloatingCta
        label={oneTap}
        sectionRef={rootRef}
        enabled={offeredTiers.length > 0}
        suppressed={checkoutOpen}
        onTap={() => {
          rootRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          const target = checkoutTierFor(offeredTiers, hasOrder ? tier : null, availabilityOf);
          if (!target) return;
          if (!(tier === target.variantId && qty > 0)) { setTier(target.variantId); setQty(Math.max(1, target.minPerOrder)); }
          openCheckout();
        }}
      />
    </>
  ) : null;

  return chrome("root", (
    <>
      {title ? <h3 className="tp-title" id={titleId}>{title}</h3> : null}

      {loadRefusal ? (
        <p className="tp-status" data-ticket-picker="refused">{loadRefusal}</p>
      ) : data === null ? (
        <p className="tp-status">{t("loading")}</p>
      ) : data.nights.length === 0 ? (
        <p className="tp-status" data-ticket-picker="no_nights">{t("noNights")}</p>
      ) : cards ? (
        cardsScreen
      ) : (
        singleScreen
      )}

      {refusal && !checkoutOpen ? <div className="tp-alert" data-ticket-picker="refusal" role="alert">{refusal}</div> : null}
    </>
  ));
}
