"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useFocusTrap } from "@/components/support/use-focus-trap";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import type {
  InstantBookActionResult,
  InstantBookFormPayload,
} from "@/lib/server-actions/instant-book-types";
import { durationLabel } from "@/lib/talent/duration-label";
import { formatMoney } from "@/lib/talent/offerings-money";

import {
    catalogCanContinueWhen,
    catalogNeedsOptions,
    submitCatalogBooking,
  catalogNextDays,
  catalogTotalCents,
  demoReservationIso,
  demoSlotsFor,
  formatClock,
  groupIsoSlotsByDay,
  type CatalogBookingMode,
} from "./catalog-booking-logic";
import {
  openCatalogBookingChat,
  type CatalogBookingChatHandoff,
  type CatalogBookingSelection,
} from "./catalog-booking-chat";
import { CATALOG_BOOKING_CSS } from "./catalog-booking-styles";
import { GuestCaptchaField, type GuestCaptchaConfig } from "./GuestCaptchaField";

type Step = "choose" | "when" | "who" | "done";
export type CatalogBookingDetail = OfferingRequestDetail & {
  startAt?: "when";
  inclusion?: string | null;
};

export type CatalogBookFn = (payload: InstantBookFormPayload) => Promise<InstantBookActionResult>;
export type CatalogSlotsFn = (offeringId: string) => Promise<{ slots: string[]; timezone: string }>;

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shouldSkipGuestCaptchaOnHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  // Mirrors instant-book-guest: only with the same flag that unlocks /dev.
  return (
    process.env.NEXT_PUBLIC_TULALA_ALLOW_DEV_SURFACES === "1" ||
    process.env.NODE_ENV === "development"
  );
}

async function fetchLiveSlots(offeringId: string): Promise<{ slots: string[]; timezone: string }> {
  const from = new Date().toISOString().slice(0, 10);
  const res = await fetch(
    `/api/public/booking/slots?offering=${encodeURIComponent(offeringId)}&from=${from}&days=14`,
    { cache: "no-store" },
  );
  const body = (await res.json()) as { slots?: string[]; timezone?: string };
  if (!res.ok) return { slots: [], timezone: "UTC" };
  return {
    slots: Array.isArray(body.slots) ? body.slots : [],
    timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC",
  };
}

export function CatalogBookingSheet({
  locale = "es",
  mode = "demo",
  tenantId = null,
  bookFn,
  slotsFn,
  showAsk = false,
  onAsk,
  captcha = null,
}: {
  locale?: string;
  mode?: CatalogBookingMode;
  tenantId?: string | null;
  bookFn?: CatalogBookFn;
  slotsFn?: CatalogSlotsFn;
  showAsk?: boolean;
  /** Override ask/chat handoff. Default opens existing guest chat with context. */
  onAsk?: (handoff: CatalogBookingChatHandoff) => void;
  captcha?: GuestCaptchaConfig | null;
}) {
  const es = locale.startsWith("es");
  const DAYS = es ? DAYS_ES : DAYS_EN;
  const MONTHS = es ? MONTHS_ES : MONTHS_EN;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrote, setWrote] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [askAttempted, setAskAttempted] = useState(false);

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
      setBusy(false);
      setWrote(false);
      setAskAttempted(false);
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
  const extrasMinutes = extras.reduce(
    (sum, a) => sum + (typeof a.durationMinutes === "number" && a.durationMinutes > 0 ? a.durationMinutes : 0),
    0,
  );
  const bookingDurationMinutes = (detail?.durationMinutes ?? 60) + extrasMinutes;
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
    if (!detail || step !== "when" || mode !== "live") return;
    let cancelled = false;
    setSlotsReady(false);
    setSlotsLoading(true);
    const run = slotsFn ?? fetchLiveSlots;
    run(detail.offeringId)
      .then((r) => {
        if (cancelled) return;
        setLiveTz(r.timezone);
        setLiveDays(groupIsoSlotsByDay(r.slots, r.timezone));
        setDayIndex(0);
        setTime(null);
        setLiveStarts(null);
      })
      .catch(() => {
        if (!cancelled) setLiveDays([]);
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
  }, [detail, step, mode, slotsFn]);

  if (!detail) return <style>{CATALOG_BOOKING_CSS}</style>;

  const day = mode === "live" ? (liveDays[dayIndex]?.date ?? days[0]!) : (days[dayIndex] ?? days[0]!);
  const demoTimes = demoSlotsFor(day, detail.durationMinutes);
  const liveTimes = liveDays[dayIndex]?.starts ?? [];
  const nameValid = name.trim().length >= 2;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phone.trim() === "" || phone.replace(/\D/g, "").length >= 8;
  const isRequest = detail.intent === "request";
  const selectedTime = catalogCanContinueWhen(time);
  const chatNameValid = name.trim().length >= 2;
  const chatPhoneValid = phone.replace(/\D/g, "").length >= 8;

  const slotLabel =
    time != null
      ? `${DAYS[day.getDay()]} ${day.getDate()} ${es ? "de" : ""} ${MONTHS[day.getMonth()]}, ${time}`.replace(
          /\s+/g,
          " ",
        ).trim()
      : null;

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

  const confirm = async () => {
    setTouched(true);
    if (!nameValid || !emailValid || !phoneValid) return;
    if (captchaRequired && !captchaToken.trim()) {
      setError(es ? "Completá la verificación." : "Complete the verification.");
      return;
    }
    setBusy(true);
    setError(null);
    const submitted = await submitCatalogBooking(mode, detail.intent, async () => {
      if (!tenantId || !detail.talentProfileId) {
        return { ok: false as const, error: es ? "Falta el estudio para guardar la cita." : "This site is not ready to take bookings." };
      }
      const reservation = liveStarts
        ? {
            startsAt: liveStarts,
            endsAt: new Date(
              new Date(liveStarts).getTime() + bookingDurationMinutes * 60_000,
            ).toISOString(),
            timezone: liveTz,
          }
        : time
          ? demoReservationIso(day, time, bookingDurationMinutes)
          : null;
      const run =
        bookFn ??
        (await import("@/lib/server-actions/instant-book-action")).createInstantBookingAction;
      return run({
        talentProfileId: detail.talentProfileId,
        tenantId,
        contactName: name.trim(),
        contactEmail: email.trim(),
        contactPhone: phone.trim() || null,
        offeringId: detail.offeringId,
        payInPerson:
          detail.reserveMode === "free" && detail.allowPayInPerson !== false,
        variantId,
        addOnIds,
        reservation,
        captchaToken: captchaRequired ? captchaToken || null : null,
        sourcePage: typeof window !== "undefined" ? window.location.pathname : null,
      });
    });
    if (!submitted.wrote) {
      window.setTimeout(() => {
        setBusy(false);
        setWrote(false);
        setStep("done");
      }, mode === "demo" ? 400 : 200);
      return;
    }
    setBusy(false);
    const result = submitted.result;
    if (!result || !result.ok) {
      setError(result?.error ?? (es ? "No se pudo guardar." : "Could not save."));
      return;
    }
    setWrote(true);
    const redirect = result.redirectPath?.trim();
    if (redirect) {
      window.location.href = redirect;
      return;
    }
    setStep("done");
  };

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
                ? isRequest
                  ? es
                    ? "Solicitud enviada"
                    : "Request sent"
                  : es
                    ? "Cita confirmada"
                    : "Appointment confirmed"
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
                  <span>{es ? "Precio base" : "Base price"}</span>
                  <strong>{money(detail.amountCents ?? 0, detail.currency)}</strong>
                </div>
                {detail.durationMinutes ? (
                  <p className="jb-fixture">
                    {es ? "Duración estimada" : "Estimated duration"}{" "}
                    {durationLabel(detail.durationMinutes, locale)}
                    {mode === "demo"
                      ? es
                        ? " · dato de prueba, se confirma al agendar"
                        : " · preview duration"
                      : null}
                  </p>
                ) : null}
                {detail.inclusion ? <p className="jb-incl">✓ {detail.inclusion}</p> : null}
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
                      <b>{money(v.amountCents ?? detail.amountCents ?? 0, detail.currency)}</b>
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
                  <span>{money(base, detail.currency)}</span>
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
              <button type="button" className="jb-back-link" onClick={() => setStep("choose")}>
                {es ? "← Cambiar servicio u opciones" : "← Change service or options"}
              </button>
              {mode === "live" && (slotsLoading || !slotsReady) ? (
                <p className="jb-fixture">{es ? "Cargando horarios…" : "Loading times…"}</p>
              ) : mode === "live" ? (
                <>
                  <div className="jb-days" role="group" aria-label={es ? "Elegí una fecha" : "Pick a date"}>
                    {liveDays.length === 0 ? null : liveDays.map((d, i) => (
                      <button
                        key={d.key}
                        type="button"
                        className="jb-day"
                        data-on={i === dayIndex}
                        onClick={() => {
                          setDayIndex(i);
                          setTime(null);
                          setLiveStarts(null);
                        }}
                      >
                        <span>{DAYS[d.date.getDay()]?.slice(0, 3)}</span>
                        <b>{d.date.getDate()}</b>
                        <small>{MONTHS[d.date.getMonth()]}</small>
                      </button>
                    ))}
                  </div>
                  {liveTimes.length === 0 ? (
                    <div className="jb-empty">
                      <strong>{es ? "Sin horarios disponibles." : "No times available."}</strong>
                      <p>
                        {es
                          ? "No hay huecos en las próximas dos semanas. Probá otra fecha o consultá."
                          : "Nothing is open in the next two weeks. Try another day or send a question."}
                      </p>
                    </div>
                  ) : (
                    <div className="jb-times" role="group" aria-label={es ? "Elegí un horario" : "Pick a time"}>
                      {liveTimes.map((iso) => {
                        const label = formatClock(iso, liveTz, locale);
                        return (
                          <button
                            key={iso}
                            type="button"
                            className="jb-time"
                            data-on={iso === liveStarts}
                            onClick={() => {
                              setLiveStarts(iso);
                              setTime(label);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
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
                          <span>{DAYS[d.getDay()]?.slice(0, 3)}</span>
                          <b>{d.getDate()}</b>
                          <small>{MONTHS[d.getMonth()]}</small>
                        </button>
                      );
                    })}
                  </div>
                  {demoTimes.length === 0 ? (
                    <div className="jb-empty">
                      <strong>{es ? "Sin horarios disponibles ese día." : "No times that day."}</strong>
                      <p>{es ? "Elegí otra fecha." : "Pick another date."}</p>
                    </div>
                  ) : (
                    <div className="jb-times" role="group" aria-label={es ? "Elegí un horario" : "Pick a time"}>
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
                {DAYS[day.getDay()]} {day.getDate()} {es ? "de" : ""} {MONTHS[day.getMonth()]}, {time} ·{" "}
                {money(total, detail.currency)}
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
              <p className="jb-fixture">
                {es
                  ? "No se cobra nada ahora. El pago se realiza en el estudio."
                  : "Nothing is charged now. Pay at the studio."}
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
              <h3>
                {DAYS[day.getDay()]} {day.getDate()} {es ? "de" : ""} {MONTHS[day.getMonth()]}, {time}
              </h3>
              <p>
                {detail.title}
                {variant ? ` · ${variant.label}` : ""}
                {extras.length ? ` · ${extras.map((e) => e.label).join(", ")}` : ""} ·{" "}
                {money(total, detail.currency)}
              </p>
              <p className="jb-fixture">
                {isRequest
                  ? es
                    ? "Queda pendiente de confirmación."
                    : "This stays pending until it is confirmed."
                  : es
                    ? "Recibirás la confirmación por correo."
                    : "You will get the confirmation by email."}
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
              <b>{money(total, detail.currency)}</b>
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
              {needsVariant && !variant
                ? es
                  ? "Elegí una opción"
                  : "Choose an option"
                : es
                  ? "Continuar: elegir horario"
                  : "Continue: pick a time"}
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
            isRequest ? (
              <button
                type="button"
                className="jb-cta"
                data-catalog-continue="who"
                data-catalog-chat="primary"
                disabled={busy}
                onClick={() => startChat()}
              >
                {es ? "Chateá ahora" : "Chat now"}
              </button>
            ) : (
              <button
                type="button"
                className="jb-cta"
                data-catalog-continue="who"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy
                  ? es
                    ? "Enviando…"
                    : "Sending…"
                  : es
                    ? "Confirmar cita"
                    : "Confirm"}
              </button>
            )
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
