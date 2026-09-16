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
 * Chrome uses the tenant's projected `--token-color-*` roles (primary, ink,
 * line, surface-raised, muted, primary-on). No parallel palette.
 *
 * NO REMAINING COUNTS on purpose (Capacity ruling): availability is the
 * pool's answer at reserve time.
 *
 * Pay-at-the-door is step 1b. Its rule is computed and SHOWN per night so the
 * guest reads the true sentence ("opens closer to the date" / "doors are
 * open"), but it is not offered as a choice here.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";
import { afterTicketPurchaseSuccess } from "@/lib/events/ticket-purchase";
import { COPY, UUID, formatWhen, money, newOrderKey, pickLocale } from "./ticket-picker-copy";
import { TP_CSS } from "./ticket-picker-css";
import { autoNight, orderTotalCents, tierFromQuery, visibleTiers, type TicketPickerStep, type TierPresentation } from "./ticket-picker-steps";



export interface TicketPickerIslandProps {
  tenantId: string;
  eventId: string;
  title?: string;
  locale?: string;
  /**
   * v2 presentation. `layout: "cards"` turns the tier list into image cards
   * and the purchase into three steps (ticket → how many → your details) with
   * a live total; `presentation: "sheet"` adds a sticky "Buy tickets" bar on
   * phones that opens the flow in a bottom sheet (a side panel on desktop).
   * Both default to the original single-screen list, so every page that
   * placed this block before v2 renders exactly as it did.
   */
  presentation?: "inline" | "sheet";
  layout?: "cards" | "list";
  tiers?: ReadonlyArray<TierPresentation> | null;
  /** `auto` (default) hides the night picker when only one night is sellable. */
  showNightPicker?: "auto" | "always";
  ctaLabel?: string;
  /**
   * TEST-ONLY: seed the loaded state so a static render (the Creative
   * Director's file review) shows a real state instead of "loading". Never
   * set on a live page; when set, no action is called.
   */
  preload?: { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[]; ageGate?: number | null } | null;
}

type Loaded = { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[]; ageGate: number | null };

export function TicketPickerIsland({ tenantId, eventId, title, locale, preload, presentation, layout, tiers: tierPresentation, showNightPicker, ctaLabel: ctaOverride }: TicketPickerIslandProps) {
  const loc = pickLocale(locale);
  const t = (key: string) => COPY[loc][key] ?? COPY.en[key] ?? key;
  // NOT CONFIGURED is decided here, before any action: an author who dropped
  // the block with no event sees why, not an outage.
  const configured = UUID.test(tenantId) && UUID.test(eventId);
  const stepped = layout === "cards";
  const sheetMode = presentation === "sheet";

  // The hidden-tier link: `/page?tier=<variantId>`. Read once, synchronously,
  // so the first load already asks the loader for it.
  const [queryTier] = useState<string | null>(() => (typeof window === "undefined" ? null : tierFromQuery(window.location.search)));

  const [data, setData] = useState<Loaded | null>(preload ? { ...preload, ageGate: preload.ageGate ?? null } : null);
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [night, setNight] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [promo, setPromo] = useState("");
  const [orderKey, setOrderKey] = useState(() => newOrderKey());
  const [busy, setBusy] = useState<"idle" | "holding" | "redirecting">("idle");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [payHow, setPayHow] = useState<"full" | "in_person">("full");
  const [held, setHeld] = useState<{ receiptCode: string | null } | null>(null);
  const [ageOk, setAgeOk] = useState(false);
  const [pickedSeats, setPickedSeats] = useState<string[]>([]);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  /** The hold rows behind `holdUntil`; travel with the purchase (A5). */
  const [holdIds, setHoldIds] = useState<string[]>([]);
  const [step, setStep] = useState<TicketPickerStep>("tier");
  const [sheetOpen, setSheetOpen] = useState(false);
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    if (!configured || preload) return;
    try {
      const { loadTicketPicker } = await import("@/app/(public)/_events/ticket-picker-actions");
      const res = await loadTicketPicker({ tenantId, eventId, ...(queryTier ? { includeVariantId: queryTier } : {}) });
      if (res.ok) { setData({ eventTitle: res.eventTitle, currency: res.currency, timeZone: res.timeZone, tiers: res.tiers, nights: res.nights, ageGate: res.ageGate }); setLoadRefusal(null); }
      else { setData(null); setLoadRefusal(t(res.reason)); }
    } catch { setData(null); setLoadRefusal(t("unavailable")); }
  }, [configured, preload, tenantId, eventId, loc, queryTier]);
  useEffect(() => { void load(); }, [load]);

  // One sellable night is implied (auto) so the guest never picks the obvious.
  // v1 pages always showed the night radio; v2 cards imply the one night.
  const nightMode = showNightPicker ?? (stepped ? "auto" : "always");
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
  // A linked hidden tier is pre-selected: the guest arrived with it.
  useEffect(() => {
    if (queryTier && tier === null && offeredTiers.some((x) => x.variantId.toLowerCase() === queryTier)) {
      const x = offeredTiers.find((y) => y.variantId.toLowerCase() === queryTier)!;
      setTier(x.variantId); setQty(Math.max(1, x.minPerOrder));
      if (stepped) setStep("qty");
    }
  }, [queryTier, tier, offeredTiers, stepped]);
  const chosenTier = offeredTiers.find((x) => x.variantId === tier) ?? null;
  // The strictest minimum that applies to what is actually selected. Computed
  // the same way the server computes it, and shown for the same reason the
  // server refuses without it: a gate nobody is asked about is decoration,
  // which is exactly what this was before.
  const ageGate = Math.max(data?.ageGate ?? 0, chosenTier?.ageGate ?? 0) || null;
  const canBuy = Boolean(chosenNight && chosenTier) && (!ageGate || ageOk) && busy === "idle";
  const showQty = Boolean(chosenTier && (chosenTier.minPerOrder !== 1 || chosenTier.maxPerOrder !== 1));
  const totalCents = orderTotalCents(chosenTier, qty);

  // Sheet: focus in, Escape out, body scroll locked, focus restored.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sheetRef.current?.querySelector<HTMLElement>("input, button, [href], select, textarea");
    first?.focus();
    const opener = openerRef.current;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, [sheetOpen]);

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
    if (!chosenNight || !chosenTier || busy !== "idle") return;
    if (!email.trim()) { setRefusal(t("emailRequired")); return; }
    setBusy("holding"); setRefusal(null);
    try {
      const { startTicketPurchase, startTicketCardPayment } = await import("@/app/(public)/_events/ticket-picker-actions");
      const choice = chosenNight.door.offered ? payHow : "full";
      const res = await startTicketPurchase({
        tenantId, eventId, sessionId: chosenNight.sessionId, variantId: chosenTier.variantId, units: qty,
        email: email.trim(), displayName: name.trim() || undefined, promoCode: promo.trim() || undefined, clientOrderKey: orderKey, paymentChoice: choice, locale: loc,
        // Sent only when a gate applies AND the box is ticked. The server
        // refuses a gated basket that arrives without it, so an unticked box is
        // a refusal there rather than a silent sale here.
        confirmedAge: ageGate && ageOk ? ageGate : undefined,
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
    <div data-ticket-picker={state}>
      <style>{TP_CSS}</style>
      {children}
    </div>
  );

  if (!configured) return chrome("not_configured", <p className="tp-status">{t("not_configured")}</p>);
  if (held) {
    return chrome("held", (
      <p className="tp-status">
        {t("heldDoor")}{" "}
        {held.receiptCode ? <a href={`/r/${held.receiptCode}`}>/r/{held.receiptCode}</a> : null}
      </p>
    ));
  }

  const ctaLabel = busy === "holding"
    ? (chosenNight?.door.offered && payHow === "in_person" ? t("holdDoor") : t("buying"))
    : busy === "redirecting"
      ? t("redirecting")
      : (chosenNight?.door.offered && payHow === "in_person"
        ? t("payDoor")
        : (chosenTier && chosenTier.amountCents === 0 ? t("buyFree") : t("buy")));

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
                onChange={() => { setNight(n.sessionId); setTier(null); setRefusal(null); setStep("tier"); }}
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

  const pickTier = (x: (typeof offeredTiers)[number]) => {
    setTier(x.variantId); setQty(Math.max(1, x.minPerOrder)); setRefusal(null); setAgeOk(false);
    if (stepped) setStep(x.minPerOrder !== 1 || x.maxPerOrder !== 1 ? "qty" : "details");
  };

  const tierList = data && chosenNight ? (
    offeredTiers.length === 0 ? (
      <p className="tp-status" data-ticket-picker="no_tiers">{t("noTiers")}</p>
    ) : stepped ? (
      <div className="tp-section" role="radiogroup" aria-label={t("tier")}>
        <div className="tp-cards">
          {offeredTiers.map((x) => {
            const on = tier === x.variantId;
            const price = money(x.amountCents, data.currency, loc, t("free"));
            return (
              <label key={x.variantId} className="tp-card" data-on={on ? "1" : undefined} data-tier-card={x.variantId}>
                {x.badge ? <span className="tp-badge">{x.badge}</span> : x.hidden ? <span className="tp-badge">{t("byInvitation")}</span> : null}
                {x.imageSrc ? <img className="tp-card-media" src={x.imageSrc} alt="" loading="lazy" /> : <span className="tp-card-ph" aria-hidden="true">{x.admitsPerUnit > 1 ? x.admitsPerUnit : "✦"}</span>}
                <span className="tp-card-body">
                  <input className="tp-radio" type="radio" name="tier" value={x.variantId} checked={on} onChange={() => pickTier(x)} />
                  <span className="tp-card-title">{x.label}</span>
                  <span className="tp-card-price" data-free={x.amountCents === 0 ? "1" : undefined}>{price}{x.admitsPerUnit > 1 ? ` · ${t("admits").replace("{n}", String(x.admitsPerUnit))}` : ""}</span>
                  {x.includes.length > 0 ? <ul className="tp-includes">{x.includes.map((line) => <li key={line}>{line}</li>)}</ul> : null}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    ) : (
      <div className="tp-section" role="radiogroup" aria-label={t("tier")}>
        <div className="tp-label">{t("tier")}</div>
        <div className="tp-choices">
          {offeredTiers.map((x) => {
            const on = tier === x.variantId;
            const price = money(x.amountCents, data.currency, loc, t("free"));
            return (
              <label key={x.variantId} className="tp-choice" data-on={on ? "1" : undefined}>
                <input className="tp-radio" type="radio" name="tier" value={x.variantId} checked={on} onChange={() => pickTier(x)} />
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

  const seatsSection = chosenNight && (chosenNight.seats?.length ?? 0) > 0 ? (
    <div className="tp-section" data-ticket-picker="seats">
      <div className="tp-label">{t("seats")}</div>
      <div className="tp-seats">
        {chosenNight.seats.map((seat) => {
          const on = pickedSeats.includes(seat.id);
          return (
            <button
              key={seat.id}
              type="button"
              className="tp-seat"
              data-on={on ? "1" : undefined}
              data-seat={seat.id}
              data-testid={`ticket-seat-${seat.id}`}
              aria-pressed={on}
              disabled={busy !== "idle"}
              onClick={() => setPickedSeats((prev) => (on ? prev.filter((id) => id !== seat.id) : [...prev, seat.id]))}
            >
              {seat.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="tp-cta"
        data-testid="ticket-hold-seats"
        disabled={busy !== "idle" || pickedSeats.length === 0}
        onClick={() => void holdSeats()}
      >
        {busy === "holding" ? t("holdingSeats") : t("holdSeats")}
      </button>
      {holdUntil ? <p className="tp-help">{t("heldUntil").replace("{when}", holdUntil)}</p> : null}
    </div>
  ) : null;

  const stepper = chosenTier && showQty ? (
    <div className="tp-stepper">
      <button
        type="button"
        className="tp-step"
        aria-label={t("decrease")}
        disabled={busy !== "idle" || qty <= chosenTier.minPerOrder}
        onClick={() => setQty((n) => Math.max(chosenTier.minPerOrder, n - 1))}
      >
        −
      </button>
      <span className="tp-qty" aria-live="polite">{qty}</span>
      <button
        type="button"
        className="tp-step"
        aria-label={t("increase")}
        disabled={busy !== "idle" || qty >= (chosenTier.maxPerOrder ?? 50)}
        onClick={() => setQty((n) => Math.min(chosenTier.maxPerOrder ?? 50, n + 1))}
      >
        +
      </button>
    </div>
  ) : null;

  const detailsFields = chosenTier && data ? (
    <>
      <label>
        <span className="tp-field-label">{t("email")}</span>
        <input
          className="tp-field"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy !== "idle"}
          autoComplete="email"
          inputMode="email"
          placeholder={t("emailPlaceholder")}
        />
        <span className="tp-help">{t("emailHelp")}</span>
      </label>
      <label>
        <span className="tp-field-label">{t("name")}</span>
        <input
          className="tp-field"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy !== "idle"}
          autoComplete="name"
          placeholder={t("namePlaceholder")}
        />
      </label>
      <label>
        <span className="tp-field-label">{t("promo")}</span>
        <input
          className="tp-field"
          type="text"
          name="promo"
          autoComplete="off"
          spellCheck={false}
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          disabled={busy !== "idle"}
          placeholder={t("promoPlaceholder")}
          aria-label={t("promo")}
        />
      </label>
      {chosenNight?.door.offered ? (
        <div role="radiogroup" aria-label={t("payHow")}>
          <div className="tp-label">{t("payHow")}</div>
          <div className="tp-choices">
            <label className="tp-choice" data-on={payHow === "full" ? "1" : undefined}>
              <input className="tp-radio" type="radio" name="payHow" checked={payHow === "full"} onChange={() => setPayHow("full")} disabled={busy !== "idle"} />
              <span className="tp-choice-copy"><span className="tp-choice-title">{t("payCard")}</span></span>
            </label>
            <label className="tp-choice" data-on={payHow === "in_person" ? "1" : undefined}>
              <input className="tp-radio" type="radio" name="payHow" checked={payHow === "in_person"} onChange={() => setPayHow("in_person")} disabled={busy !== "idle"} />
              <span className="tp-choice-copy">
                <span className="tp-choice-title">{t("payDoor")}</span>
                <span className="tp-choice-meta">{t("payDoorHelp")}</span>
              </span>
            </label>
          </div>
        </div>
      ) : null}
      {ageGate ? (
        <div data-ticket-picker="age-gate">
          <div className="tp-label">{t("ageGate")}</div>
          <label className="tp-choice" data-on={ageOk ? "1" : undefined}>
            <input
              className="tp-radio"
              type="checkbox"
              checked={ageOk}
              onChange={(e) => { setAgeOk(e.target.checked); setRefusal(null); }}
              disabled={busy !== "idle"}
            />
            <span className="tp-choice-copy">
              <span className="tp-choice-title">{t("ageConfirm").replace("{n}", String(ageGate))}</span>
              <span className="tp-choice-meta">{t("ageHelp")}</span>
            </span>
          </label>
        </div>
      ) : null}
    </>
  ) : null;

  const finalCta = (
    <button type="button" className="tp-cta" onClick={() => void buy()} disabled={!canBuy}>
      {ctaOverride && busy === "idle" ? ctaOverride : ctaLabel}
    </button>
  );

  // ── Legacy single screen (layout "list"): byte-compatible with v1. ──────
  const singleScreen = (
    <>
      {nightPicker}
      {tierList}
      {seatsSection}
      {chosenTier ? (
        <div className="tp-fields">
          {showQty ? (
            <div>
              <div className="tp-field-label">{t("quantity")}</div>
              {stepper}
            </div>
          ) : null}
          {detailsFields}
          {finalCta}
        </div>
      ) : null}
    </>
  );

  // ── Stepped flow (layout "cards"): ticket → how many → your details. ────
  const steps: TicketPickerStep[] = showQty || !chosenTier ? ["tier", "qty", "details"] : ["tier", "details"];
  const stepLabel: Record<TicketPickerStep, string> = { tier: t("step_tier"), qty: t("step_qty"), details: t("step_details") };
  const totalBar = (fixed: boolean) => chosenTier && data ? (
    <div className="tp-bar" data-fixed={fixed ? "1" : undefined}>
      {stepper ?? <span />}
      <div className="tp-bar-total" aria-live="polite">{t("total")}<b>{money(totalCents, data.currency, loc, t("free"))}</b></div>
      <button type="button" className="tp-cta" onClick={() => setStep("details")} disabled={busy !== "idle"}>{t("continue")}</button>
    </div>
  ) : null;
  const steppedFlow = (
    <>
      <ol className="tp-steps" aria-label={t("heading")}>
        {steps.map((s, i) => <li key={s} aria-current={step === s ? "step" : undefined}>{i + 1} · {stepLabel[s]}</li>)}
      </ol>
      {nightPicker}
      {step === "tier" ? tierList : null}
      {step === "qty" ? (
        <>
          <div className="tp-section"><div className="tp-label">{t("quantity")}</div><p className="tp-choice-title">{chosenTier?.label}</p></div>
          {seatsSection}
          {totalBar(!sheetMode)}
          <div className="tp-nav"><button type="button" className="tp-back" onClick={() => setStep("tier")}>‹ {t("back")}</button></div>
        </>
      ) : null}
      {step === "details" && chosenTier && data ? (
        <div className="tp-fields">
          {!showQty ? seatsSection : null}
          <div className="tp-summary"><span>{qty} × {chosenTier.label}</span><b>{money(totalCents, data.currency, loc, t("free"))}</b></div>
          {detailsFields}
          {finalCta}
          <div className="tp-nav"><button type="button" className="tp-back" onClick={() => setStep(showQty ? "qty" : "tier")}>‹ {t("back")}</button></div>
        </div>
      ) : null}
    </>
  );

  const flow = stepped ? steppedFlow : singleScreen;

  return chrome("root", (
    <>
      {title ? <h3 className="tp-title" id={titleId}>{title}</h3> : null}

      {loadRefusal ? (
        <p className="tp-status" data-ticket-picker="refused">{loadRefusal}</p>
      ) : data === null ? (
        <p className="tp-status">{t("loading")}</p>
      ) : data.nights.length === 0 ? (
        <p className="tp-status" data-ticket-picker="no_nights">{t("noNights")}</p>
      ) : sheetMode ? (
        <>
          {!sheetOpen ? (
            <div className="tp-sticky-cta">
              <button ref={openerRef} type="button" className="tp-cta" data-testid="ticket-open-sheet" onClick={() => setSheetOpen(true)}>{ctaOverride ?? t("openSheet")}</button>
            </div>
          ) : null}
          <button type="button" className="tp-cta" data-testid="ticket-open-inline" onClick={() => setSheetOpen(true)}>{ctaOverride ?? t("openSheet")}</button>
          {sheetOpen ? (
            <>
              <div className="tp-scrim" onClick={() => setSheetOpen(false)} aria-hidden="true" />
              <div ref={sheetRef} className="tp-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} data-ticket-picker="sheet">
                <div className="tp-grab" aria-hidden="true" />
                <div className="tp-sheet-head">
                  <span className="tp-title" style={{ margin: 0 }}>{title ?? data.eventTitle}</span>
                  <button type="button" className="tp-close" onClick={() => setSheetOpen(false)}>{t("close")}</button>
                </div>
                {flow}
              </div>
            </>
          ) : null}
        </>
      ) : (
        flow
      )}

      {refusal ? <div className="tp-alert" data-ticket-picker="refusal" role="alert">{refusal}</div> : null}
    </>
  ));
}
