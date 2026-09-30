"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useFocusTrap } from "@/components/support/use-focus-trap";
import { deriveGuestBookingPresentation } from "@/lib/booking/guest-booking-presentation";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { durationLabel } from "@/lib/talent/duration-label";
import { formatMoney } from "@/lib/talent/offerings-money";
import {
  chooseStepContinueLabel,
  DEFAULT_SHEET_BOOKING_SETTINGS,
  whenStepTimeGroupLabel,
  type CatalogSheetBookingSettings,
} from "@/lib/talent/selling-booking-settings";
import {
  doneStepNextActionCopy,
  resolveWhoStepPaymentUi,
} from "@/lib/talent/who-step-payment-copy";

import type { CatalogBookFn } from "./catalog-booking-confirm";
import {
  openCatalogBookingChat,
  type CatalogBookingChatHandoff,
  type CatalogBookingSelection,
} from "./catalog-booking-chat";
import {
  catalogBookingDurationMinutes,
  catalogCanContinueWhen,
  catalogDetailIsPurchase,
  catalogMonthShort,
  catalogNeedsOptions,
  catalogNextDays,
  catalogSelectedStartStillOpen,
  catalogSlotDateLabel,
  catalogTotalCents,
  catalogWeekdayShort,
  demoSlotsFor,
  formatClock,
  groupIsoSlotsByDay,
  type CatalogBookingMode,
} from "./catalog-booking-logic";
import { catalogIsQuote, catalogPriceLabel } from "./catalog-booking-price";
import { CatalogInquiryBrief } from "./catalog-inquiry-brief";
import {
  fetchLiveSlots,
  shouldSkipGuestCaptchaOnHost,
  type CatalogSlotsFn,
} from "./catalog-booking-live-slots";
import { CATALOG_BOOKING_CSS } from "./catalog-booking-styles";
import { GuestCaptchaField, type GuestCaptchaConfig } from "./GuestCaptchaField";
import { CatalogLiveWhenPicker } from "./CatalogLiveWhenPicker";
import type { CatalogTakenSlotNotice } from "./catalog-taken-slot";
import { useCatalogBookingConfirm } from "./use-catalog-booking-confirm";

type Step = "choose" | "when" | "who" | "done";
export type CatalogBookingDetail = OfferingRequestDetail & {
  startAt?: "when";
  inclusion?: string | null;
};

export type { CatalogBookFn, CatalogSlotsFn, CatalogSheetBookingSettings };

export function CatalogBookingSheet({
  locale = "es",
  mode = "demo",
  tenantId = null,
  bookFn,
  slotsFn,
  showAsk = false,
  onAsk,
  captcha = null,
  bookingSettings = DEFAULT_SHEET_BOOKING_SETTINGS,
  onlineCollectReady = true,
}: {
  locale?: string;
  mode?: CatalogBookingMode;
  tenantId?: string | null;
  bookFn?: CatalogBookFn;
  slotsFn?: CatalogSlotsFn;
  showAsk?: boolean;
  onAsk?: (handoff: CatalogBookingChatHandoff) => void;
  captcha?: GuestCaptchaConfig | null;
  bookingSettings?: CatalogSheetBookingSettings;
  /** When false with online collect required, force inquiry + unavailable copy. */
  onlineCollectReady?: boolean;
}) {
  const es = locale.startsWith("es");
  const [detail, setDetail] = useState<CatalogBookingDetail | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const [liveStarts, setLiveStarts] = useState<string | null>(null);
  const [liveTz, setLiveTz] = useState("UTC");
  const [liveDays, setLiveDays] = useState<Array<{ key: string; date: Date; starts: string[] }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsReady, setSlotsReady] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrote, setWrote] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [askAttempted, setAskAttempted] = useState(false);
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);
  const [takenNotice, setTakenNotice] = useState<CatalogTakenSlotNotice | null>(null);
  const liveStartsRef = useRef<string | null>(null);

  const skipCaptcha = shouldSkipGuestCaptchaOnHost();
  const captchaRequired =
    !skipCaptcha && captcha != null && captcha.provider !== "none" && Boolean(captcha.siteKey);

  const days = useMemo(() => catalogNextDays(), []);
  const trapRef = useFocusTrap<HTMLDivElement>(detail !== null);
  const money = useCallback(
    (cents: number, currency: string) => formatMoney(cents, currency, locale),
    [locale],
  );

  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent).detail as CatalogBookingDetail | undefined;
      if (!d) return;
      // PKG-2: products / untimed packages use CatalogPurchaseMount (live + demo preview).
      // Skip only when that rail handles the event so demo Buy never dispatches to nowhere.
      if (d.intent === "instant" && catalogDetailIsPurchase(d)) return;
      setDetail(d);
      setVariantId(null);
      setAddOnIds([]);
      setDayIndex(0);
      setTime(null);
      setLiveStarts(null);
      setName("");
      setPhone("");
      setEmail("");
      setTouched(false);
      setError(null);
      setWrote(false);
      setAskAttempted(false);
      setTakenNotice(null);
      const needsOption = catalogNeedsOptions(d);
      setStep(d.startAt === "when" && !needsOption ? "when" : "choose");
    };
    const names = ["tulala:offering-instant", "tulala:offering-slot", "tulala:offering-request"];
    names.forEach((n) => window.addEventListener(n, open));
    return () => names.forEach((n) => window.removeEventListener(n, open));
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new window.CustomEvent("tulala:maison-sheet", { detail: { open: detail !== null } }),
    );
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [detail]);

  const variant = (detail?.variants ?? []).find((v) => v.id === variantId) ?? null;
  const extras = (detail?.addOns ?? []).filter((a) => addOnIds.includes(a.id));
  const bookingDurationMinutes = catalogBookingDurationMinutes(
    detail?.durationMinutes,
    detail?.addOns ?? [],
    addOnIds,
  );
  const needsVariant = (detail?.variants ?? []).length > 0;
  const base = variant?.amountCents ?? detail?.amountCents ?? 0;
  const total = detail ? catalogTotalCents(detail, variantId, addOnIds) : 0;

  useEffect(() => {
    if (!detail) return;
    if (needsVariant && !variant) return;
    const bits = [variant?.label, ...extras.map((e) => e.label)].filter(Boolean);
    window.dispatchEvent(
      new window.CustomEvent("tulala:maison-selected", {
        detail: {
          offeringId: detail.offeringId,
          title: detail.title,
          detail: bits.length ? bits.join(" · ") : null,
          totalCents: total,
          currency: detail.currency,
        },
      }),
    );
  }, [detail, variant, needsVariant, extras, total]);

  useEffect(() => {
    liveStartsRef.current = liveStarts;
  }, [liveStarts]);

  useEffect(() => {
    if (!detail || step !== "when" || mode !== "live") return;
    let cancelled = false;
    setSlotsReady(false);
    setSlotsLoading(true);
    const run = slotsFn ?? fetchLiveSlots;
    // BUF-5: project slots for base + extras so near-close / near-busy starts
    // that only fit the shorter base duration never appear.
    run(detail.offeringId, bookingDurationMinutes)
      .then((r) => {
        if (cancelled) return;
        setLiveTz(r.timezone);
        const grouped = groupIsoSlotsByDay(r.slots, r.timezone);
        setLiveDays(grouped);
        // BUF-6: keep the pick only when that ISO is still offered; otherwise
        // clear clock + ISO so confirm cannot send a start that no longer fits.
        const prev = liveStartsRef.current;
        if (catalogSelectedStartStillOpen(prev, r.slots)) {
          const idx = grouped.findIndex((d) => d.starts.includes(prev!));
          if (idx >= 0) setDayIndex(idx);
          return;
        }
        setDayIndex(0);
        setTime(null);
        setLiveStarts(null);
      })
      .catch(() => {
        if (!cancelled) {
          setLiveDays([]);
          setTime(null);
          setLiveStarts(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSlotsLoading(false);
          setSlotsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail, step, mode, slotsFn, bookingDurationMinutes, slotsRefreshKey]);

  const day = mode === "live" ? (liveDays[dayIndex]?.date ?? days[0]!) : (days[dayIndex] ?? days[0]!);
  const nameValid = name.trim().length >= 2;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phone.trim() === "" || phone.replace(/\D/g, "").length >= 8;
  const { busy, confirm, resetConfirmGuards } = useCatalogBookingConfirm({
    locale,
    mode,
    tenantId,
    bookFn,
    intent: detail?.intent ?? "instant",
    talentProfileId: detail?.talentProfileId ?? null,
    offeringId: detail?.offeringId ?? "",
    reserveMode: detail?.reserveMode ?? "free",
    allowPayInPerson: detail?.allowPayInPerson !== false,
    variantId,
    addOnIds,
    liveStarts,
    liveTz,
    liveDays,
    bookingDurationMinutes,
    day,
    time,
    captchaRequired,
    captchaToken,
    nameValid,
    emailValid,
    phoneValid,
    name,
    email,
    phone,
    setTouched,
    setError,
    setTime,
    setLiveStarts,
    setStep,
    setWrote,
    setSlotsRefreshKey,
    setTakenNotice,
  });

  useEffect(() => {
    if (detail) return;
    resetConfirmGuards();
  }, [detail, resetConfirmGuards]);

  if (!detail) return <style>{CATALOG_BOOKING_CSS}</style>;

  const demoTimes = demoSlotsFor(day, bookingDurationMinutes);
  const isRequest = detail.intent === "request";
  // Just written, no order state yet: online-collect reads HELD, never confirmed.
  const doneStatus = deriveGuestBookingPresentation({
    bookingMode: isRequest ? "request" : "instant", reserveMode: detail.reserveMode,
    payAtVisit: detail.reserveMode === "free", orderStatus: null, transactionStatus: null,
    holdExpiresAt: null, now: new Date(), locale,
  });
  const { whoAction, whoCtaText, paymentFixture } = resolveWhoStepPaymentUi({
    reserveMode: detail.reserveMode,
    allowPayInPerson: detail.allowPayInPerson,
    depositPct: detail.depositPct,
    onlineCollectReady,
    locale,
    offeringIntent: detail.intent,
    bookingSettings,
  });
  const isQuote = catalogIsQuote(detail);
  const timeGroupLabel = whenStepTimeGroupLabel({ action: whoAction, locale });
  const selectedTime = catalogCanContinueWhen(time);
  const chatNameValid = name.trim().length >= 2;
  const chatPhoneValid = phone.replace(/\D/g, "").length >= 8;

  const slotLabel = time != null ? catalogSlotDateLabel(day, time, es) : null;

  const buildSelection = (): CatalogBookingSelection => ({
    variantId,
    variantLabel: variant?.label ?? null,
    addOnIds,
    addOnLabels: extras.map((e) => e.label),
    slotLabel,
    startsAt: liveStarts,
    totalCents: total,
  });

  const startChat = () => {
    setTouched(true);
    setAskAttempted(true);
    // Product: Nombre + WhatsApp required to start chat / create client-or-prospect.
    if (!chatNameValid || !chatPhoneValid) return;
    const handoff: CatalogBookingChatHandoff = {
      detail,
      selection: buildSelection(),
      visitor: {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      },
      from: "sheet",
      sourcePage: typeof window !== "undefined" ? window.location.pathname : undefined,
      demo: mode === "demo",
    };
    setDetail(null);
    if (onAsk) onAsk(handoff);
    else openCatalogBookingChat(handoff);
  };

  /** Empty-slot escape hatch — open ask/chat without contact (launcher collects it). */
  const askAvailability = () => {
    const handoff: CatalogBookingChatHandoff = {
      detail,
      selection: buildSelection(),
      from: "sheet",
      sourcePage: typeof window !== "undefined" ? window.location.pathname : undefined,
      demo: mode === "demo",
    };
    setDetail(null);
    if (onAsk) onAsk(handoff);
    else openCatalogBookingChat(handoff);
  };
  const emptyConsultButton = (
    <button type="button" className="jb-ask" data-catalog-empty-ask="" onClick={() => askAvailability()}>
      {es ? "Consultar disponibilidad" : "Check availability"}
    </button>
  );

  return (
    <div
      ref={trapRef}
      className="jb-back"
      role="dialog"
      aria-modal="true"
      aria-label={es ? `Reservar ${detail.title}` : `Book ${detail.title}`}
      data-catalog-booking={mode}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setDetail(null);
      }}
    >
      <style>{CATALOG_BOOKING_CSS}</style>
      <div className="jb-sheet">
        <header className="jb-head">
          <div>
            <p className="jb-kicker">
              {step === "done"
                ? doneStatus.headline
                : es
                  ? "Tu reserva"
                  : "Your booking"}
            </p>
            <h2>{detail.title}</h2>
          </div>
          <button type="button" className="jb-x" onClick={() => setDetail(null)} aria-label={es ? "Cerrar" : "Close"}>
            ✕
          </button>
        </header>

        <div className="jb-body">
          {step === "choose" ? (
            <>
              <div className="jb-summary">
                <div>
                  <span>{isQuote ? (es ? "Precio" : "Price") : es ? "Precio base" : "Base price"}</span>
                  <strong data-catalog-price={isQuote ? "quote" : "money"}>
                    {catalogPriceLabel(detail, detail.amountCents ?? 0, locale, money)}
                  </strong>
                </div>
                {bookingDurationMinutes ? (
                  <p className="jb-fixture">
                    {es ? "Duración estimada" : "Estimated duration"}{" "}
                    {durationLabel(bookingDurationMinutes, locale)}
                    {mode === "demo"
                      ? es
                        ? " · dato de prueba, se confirma al agendar"
                        : " · preview duration"
                      : null}
                  </p>
                ) : null}
                <CatalogInquiryBrief
                  description={detail.description}
                  where={detail.where}
                  inclusion={detail.inclusion}
                  locale={locale}
                />
              </div>

              {needsVariant ? (
                <fieldset className="jb-group">
                  <legend>
                    {es ? "Elegí una opción" : "Choose an option"}{" "}
                    <span className="jb-req">{es ? "obligatorio" : "required"}</span>
                  </legend>
                  {(detail.variants ?? []).map((v) => (
                    <label key={v.id} className="jb-opt" data-on={v.id === variantId}>
                      <input
                        type="radio"
                        name="cb-variant"
                        checked={v.id === variantId}
                        onChange={() => setVariantId(v.id)}
                      />
                      <span>{v.label}</span>
                      <b>
                        {catalogPriceLabel(
                          detail,
                          v.amountCents ?? detail.amountCents ?? 0,
                          locale,
                          money,
                        )}
                      </b>
                    </label>
                  ))}
                </fieldset>
              ) : null}

              {(detail.addOns ?? []).length > 0 ? (
                <fieldset className="jb-group">
                  <legend>
                    {es ? "Diseños y extras" : "Designs and extras"}{" "}
                    <span className="jb-opt-tag">{es ? "opcional" : "optional"}</span>
                  </legend>
                  {(detail.addOns ?? []).map((a) => {
                    const on = addOnIds.includes(a.id);
                    return (
                      <label key={a.id} className="jb-opt" data-on={on}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setAddOnIds((prev) =>
                              prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                            )
                          }
                        />
                        <span>
                          {a.label}
                          {typeof a.durationMinutes === "number" && a.durationMinutes > 0
                            ? ` · +${a.durationMinutes} min`
                            : ""}
                        </span>
                        <b>+ {money(a.amountCents, detail.currency)}</b>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}

              <div className="jb-lines">
                <div>
                  <span>{variant ? `${detail.title} · ${variant.label}` : detail.title}</span>
                  <span>{catalogPriceLabel(detail, base, locale, money)}</span>
                </div>
                {extras.map((e) => (
                  <div key={e.id}>
                    <span>{e.label}</span>
                    <span>+ {money(e.amountCents, detail.currency)}</span>
                  </div>
                ))}
                {extras.length === 0 ? (
                  <p className="jb-fixture">{es ? "Sin extras seleccionados." : "No extras selected."}</p>
                ) : null}
              </div>
            </>
          ) : null}

          {step === "when" ? (
            <>
              <button type="button" className="jb-back-link" onClick={() => { setTakenNotice(null); setStep("choose"); }}>
                {es ? "← Cambiar servicio u opciones" : "← Change service or options"}
              </button>
              {mode === "live" && (slotsLoading || !slotsReady) ? (
                <p className="jb-fixture">
                  <span className="cb-spinner" aria-hidden="true" />
                  {es ? "Cargando horarios…" : "Loading times…"}
                </p>
              ) : mode === "live" ? (
                <CatalogLiveWhenPicker
                  es={es}
                  locale={locale}
                  liveDays={liveDays}
                  dayIndex={dayIndex}
                  liveStarts={liveStarts}
                  liveTz={liveTz}
                  timeGroupLabel={timeGroupLabel}
                  emptyConsultButton={emptyConsultButton}
                  takenNotice={takenNotice}
                  onPickDay={(i) => { setDayIndex(i); setTime(null); setLiveStarts(null); }}
                  onPickStart={(iso, label, i) => {
                    if (i !== undefined && i >= 0) setDayIndex(i);
                    setLiveStarts(iso);
                    setTime(label);
                    setTakenNotice(null);
                  }}
                />
              ) : (
                <>
                  <div className="jb-days" role="group" aria-label={es ? "Elegí una fecha" : "Pick a date"}>
                    {days.map((d, i) => {
                      const closed = d.getDay() === 0;
                      return (
                        <button
                          key={d.toISOString()}
                          type="button"
                          className="jb-day"
                          data-on={i === dayIndex}
                          disabled={closed}
                          onClick={() => {
                            setDayIndex(i);
                            setTime(null);
                          }}
                        >
                          <span>{catalogWeekdayShort(d, es)}</span>
                          <b>{d.getDate()}</b>
                          <small>{catalogMonthShort(d, es)}</small>
                        </button>
                      );
                    })}
                  </div>
                  {demoTimes.length === 0 ? (
                    <div className="jb-empty">
                      <strong>{es ? "Sin horarios disponibles ese día." : "No times that day."}</strong>
                      <p>{es ? "Elegí otra fecha." : "Pick another date."}</p>
                      {emptyConsultButton}
                    </div>
                  ) : (
                    <div className="jb-times" role="group" aria-label={timeGroupLabel}>
                      {demoTimes.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="jb-time"
                          data-on={t === time}
                          onClick={() => setTime(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}

          {step === "who" ? (
            <>
              <button type="button" className="jb-back-link" onClick={() => setStep("when")}>
                {es ? "← Cambiar horario" : "← Change time"}
              </button>
              <p className="jb-recap">
                {time ? catalogSlotDateLabel(day, time, es) : null}
                {isQuote ? "" : ` · ${money(total, detail.currency)}`}
                {isQuote ? ` · ${es ? "A cotizar" : "Quote"}` : ""}
              </p>
              <label className="jb-field">
                <span>{es ? "Nombre" : "Name"}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={es ? "Tu nombre" : "Your name"}
                  aria-invalid={touched && !nameValid}
                  data-testid="cb-name"
                />
                {touched && !nameValid ? (
                  <em>{es ? "Escribí tu nombre para confirmar." : "Enter your name to confirm."}</em>
                ) : null}
              </label>
              <label className="jb-field">
                <span>
                  WhatsApp <i>{es ? "opcional" : "optional"}</i>
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched(true)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={es ? "Para avisarte de cualquier cambio" : "If we need to reach you"}
                  aria-invalid={touched && !phoneValid}
                  data-testid="cb-phone"
                />
                {touched && !phoneValid ? <em>{es ? "Revisá el número." : "Check the number."}</em> : null}
                {askAttempted && !chatPhoneValid ? (
                  <em>{es ? "WhatsApp hace falta para chatear." : "WhatsApp is needed to chat."}</em>
                ) : null}
              </label>
              <label className="jb-field">
                <span>{es ? "Correo" : "Email"}</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={es ? "Para enviarte la confirmación" : "For the confirmation"}
                  aria-invalid={touched && !emailValid}
                  data-testid="cb-email"
                />
                {touched && !emailValid ? (
                  <em>{es ? "Necesitamos un correo válido." : "We need a valid email."}</em>
                ) : null}
              </label>
              <p className="jb-fixture" data-catalog-who-pay="">
                {paymentFixture}
              </p>
              {captchaRequired ? (
                <GuestCaptchaField
                  captcha={captcha}
                  locale={locale}
                  onToken={(token) => setCaptchaToken(token)}
                />
              ) : null}
              {showAsk ? (
                <button
                  type="button"
                  className="jb-ask"
                  data-catalog-ask=""
                  onClick={() => startChat()}
                >
                  {es
                    ? "¿Tenés una duda? Preguntá antes de reservar →"
                    : "Have a question? Ask before booking →"}
                </button>
              ) : null}
              {error ? <p className="jb-error">{error}</p> : null}
            </>
          ) : null}

          {step === "done" ? (
            <div className="jb-done">
              <div className="jb-check" aria-hidden="true">
                ✓
              </div>
              <h3>{time ? catalogSlotDateLabel(day, time, es) : null}</h3>
              <p>
                {detail.title}
                {variant ? ` · ${variant.label}` : ""}
                {extras.length ? ` · ${extras.map((e) => e.label).join(", ")}` : ""}
                {isQuote ? ` · ${es ? "A cotizar" : "Quote"}` : ` · ${money(total, detail.currency)}`}
              </p>
              {doneStatus.detail ? <p className="jb-fixture" data-catalog-done-state={doneStatus.bookingState}>{doneStatus.detail}</p> : null}
              <p className="jb-fixture" data-catalog-done-next="">
                {doneStepNextActionCopy({
                  reserveMode: detail.reserveMode,
                  allowPayInPerson: detail.allowPayInPerson,
                  depositPct: detail.depositPct,
                  onlineCollectReady,
                  locale,
                  wrote,
                  isRequest,
                })}
              </p>
              {mode === "demo" || !wrote ? (
                <p className="jb-demo" data-catalog-demo-note="">
                  {es
                    ? "Demostración: aquí no se guarda nada."
                    : "Preview: nothing is saved here."}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="jb-foot">
          {step !== "done" ? (
            <div className="jb-total">
              <span>Total</span>
              <b data-catalog-price={isQuote ? "quote" : "money"}>
                {catalogPriceLabel(detail, total, locale, money)}
              </b>
            </div>
          ) : (
            <span />
          )}

          {step === "choose" ? (
            <button
              type="button"
              className="jb-cta"
              data-catalog-continue="choose"
              disabled={needsVariant && !variant}
              onClick={() => setStep("when")}
            >
              {chooseStepContinueLabel({
                action: whoAction,
                locale,
                needsOption: needsVariant && !variant,
              })}
            </button>
          ) : null}
          {step === "when" ? (
            <button
              type="button"
              className="jb-cta"
              data-catalog-continue="when"
              disabled={!selectedTime}
              onClick={() => setStep("who")}
            >
              {es ? "Continuar" : "Continue"}
            </button>
          ) : null}
          {step === "who" ? (
            <button
              type="button"
              className="jb-cta"
              data-catalog-continue="who"
              data-catalog-chat={whoAction === "chat" ? "primary" : undefined}
              data-catalog-who-cta={bookingSettings.whoPrimaryCta}
              disabled={busy}
              onClick={() => (whoAction === "chat" ? startChat() : void confirm())}
            >
              {busy && whoAction === "confirm"
                ? es
                  ? "Enviando…"
                  : "Sending…"
                : whoCtaText}
            </button>
          ) : null}
          {step === "done" ? (
            <button type="button" className="jb-cta" onClick={() => setDetail(null)}>
              {es ? "Listo" : "Done"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
