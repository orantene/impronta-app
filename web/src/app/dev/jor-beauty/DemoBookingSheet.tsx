"use client";

/**
 * DemoBookingSheet — the appointment flow, wired for the prototype.
 *
 * On the REAL profile these events are consumed by the production mounts
 * (`OfferingInstantMount` → `createInstantBookingAction`, `ProfileSlotPickerChrome`
 * → the availability engine). Those need a tenant, a session and Supabase, none
 * of which a dev harness has, so this component listens to the SAME events the
 * storefront dispatches —
 *
 *     tulala:offering-instant · tulala:offering-slot · tulala:offering-request
 *
 * — and walks the identical steps against in-memory data:
 *
 *   1. what you are booking (identity, base price, what it includes)
 *   2. the required option, when the service has one
 *   3. optional extras
 *   4. an itemised total in MXN
 *   5. "Continuar: elegir horario" → date + time from the published hours
 *   6. your details, validated
 *   7. confirmation — or, for a request-mode service, an honest
 *      "pending confirmation" state rather than a fake booking
 *
 * It SHOWS the flow; it never takes a booking. Nothing is written and no money
 * moves. It reports the live selection back to the menu
 * (`tulala:maison-selected`) so the bottom bar can state the real service and
 * the real total, and its open/closed state (`tulala:maison-sheet`) so the bar
 * hides while the sheet is up.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useFocusTrap } from "@/app/t/[profileCode]/_chat/use-focus-trap";

import type { OfferingRequestDetail } from "@/app/t/[profileCode]/_shared/OfferingCta";
import { formatMoney } from "@/lib/talent/offerings-money";
import { durationLabel } from "@/app/t/[profileCode]/_maison/MaisonMenu";
import { askQuestion } from "@/app/t/[profileCode]/_maison/MaisonAsk";

type Step = "choose" | "when" | "who" | "done";
type Detail = OfferingRequestDetail & { startAt?: "when"; inclusion?: string | null };

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Published hours: Monday–Saturday. Sunday is closed. FIXTURE DATA. */
function slotsFor(date: Date, durationMinutes: number | null): string[] {
  const day = date.getDay();
  if (day === 0) return [];
  const span = durationMinutes ?? 60;
  const out: string[] = [];
  const end = (day === 6 ? 16 : 19) * 60;
  for (let min = 10 * 60; min + span <= end; min += 90) {
    out.push(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
  }
  const load = (date.getDate() + day) % 3;
  return out.filter((_, i) => (load === 0 ? true : i % (load + 1) !== 0));
}

function nextDays(): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 12; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

export function DemoBookingSheet({ locale = "es" }: { locale?: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => nextDays(), []);
  const trapRef = useFocusTrap<HTMLDivElement>(detail !== null);
  const money = useCallback(
    (cents: number, currency: string) => formatMoney(cents, currency, locale),
    [locale],
  );

  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent).detail as Detail | undefined;
      if (!d) return;
      setDetail(d);
      // A service with a required option NEVER starts pre-picked: "option not
      // chosen yet" is a real state the visitor should see and resolve.
      setVariantId(null);
      setAddOnIds([]);
      setDayIndex(0);
      setTime(null);
      setName("");
      setPhone("");
      setEmail("");
      setTouched(false);
      setError(null);
      setBusy(false);
      const needsOption = (d.variants ?? []).length > 0 || (d.addOns ?? []).length > 0;
      setStep(d.startAt === "when" && !needsOption ? "when" : "choose");
    };
    const names = ["tulala:offering-instant", "tulala:offering-slot", "tulala:offering-request"];
    names.forEach((n) => window.addEventListener(n, open));
    return () => names.forEach((n) => window.removeEventListener(n, open));
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("tulala:maison-sheet", { detail: { open: detail !== null } }),
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
  const needsVariant = (detail?.variants ?? []).length > 0;
  const base = variant?.amountCents ?? detail?.amountCents ?? 0;
  const total = base + extras.reduce((sum, a) => sum + a.amountCents, 0);

  // Keep the menu's bottom bar in step with what is chosen in here.
  useEffect(() => {
    if (!detail) return;
    if (needsVariant && !variant) return;
    const bits = [variant?.label, ...extras.map((e) => e.label)].filter(Boolean);
    window.dispatchEvent(
      new CustomEvent("tulala:maison-selected", {
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

  if (!detail) return null;

  const day = days[dayIndex] ?? days[0]!;
  const times = slotsFor(day, detail.durationMinutes);
  const nameValid = name.trim().length >= 2;
  // The guest booking path keys the client record on EMAIL
  // (ensureGuestClientByEmail), so that one is required. WhatsApp is the
  // channel she actually answers on, so it is asked for and kept optional
  // rather than silently dropped.
  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phone.trim() === "" || phone.replace(/\D/g, "").length >= 8;
  const isRequest = detail.intent === "request";

  const confirm = () => {
    setTouched(true);
    if (!nameValid || !emailValid || !phoneValid) return;
    setBusy(true);
    setError(null);
    // Stands in for the server action round trip so the loading state is real.
    window.setTimeout(() => {
      setBusy(false);
      setStep("done");
    }, 900);
  };

  return (
    <div
      ref={trapRef}
      className="jb-back"
      role="dialog"
      aria-modal="true"
      aria-label={`Reservar ${detail.title}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setDetail(null);
      }}
    >
      <div className="jb-sheet">
        <header className="jb-head">
          <div>
            <p className="jb-kicker">
              {step === "done" ? (isRequest ? "Solicitud enviada" : "Cita confirmada") : "Tu reserva"}
            </p>
            <h2>{detail.title}</h2>
          </div>
          <button type="button" className="jb-x" onClick={() => setDetail(null)} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="jb-body">
          {step === "choose" ? (
            <>
              <div className="jb-summary">
                <div>
                  <span>Precio base</span>
                  <strong>{money(detail.amountCents ?? 0, detail.currency)}</strong>
                </div>
                {detail.durationMinutes ? (
                  <p className="jb-fixture">
                    Duración estimada {durationLabel(detail.durationMinutes, locale)} · dato de
                    prueba, se confirma al agendar
                  </p>
                ) : null}
                {detail.inclusion ? <p className="jb-incl">✓ {detail.inclusion}</p> : null}
              </div>

              {needsVariant ? (
                <fieldset className="jb-group">
                  <legend>
                    Elegí una opción <span className="jb-req">obligatorio</span>
                  </legend>
                  {(detail.variants ?? []).map((v) => (
                    <label key={v.id} className="jb-opt" data-on={v.id === variantId}>
                      <input
                        type="radio"
                        name="jb-variant"
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
                    Diseños y extras <span className="jb-opt-tag">opcional</span>
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
                        <span>{a.label}</span>
                        <b>+ {money(a.amountCents, detail.currency)}</b>
                      </label>
                    );
                  })}
                  <p className="jb-fixture">
                    Falta confirmar si los diseños se cobran por uña o por set, y cuáles pueden
                    combinarse.
                  </p>
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
                {extras.length === 0 ? <p className="jb-fixture">Sin extras seleccionados.</p> : null}
              </div>
            </>
          ) : null}

          {step === "when" ? (
            <>
              <button type="button" className="jb-back-link" onClick={() => setStep("choose")}>
                ← Cambiar servicio u opciones
              </button>
              <div className="jb-days" role="group" aria-label="Elegí una fecha">
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
              {times.length === 0 ? (
                <div className="jb-empty">
                  <strong>Sin horarios disponibles ese día.</strong>
                  <p>
                    Jorg Beauty atiende de lunes a sábado. Elegí otra fecha o consultá por
                    disponibilidad de último momento.
                  </p>
                </div>
              ) : (
                <div className="jb-times" role="group" aria-label="Elegí un horario">
                  {times.map((t) => (
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
          ) : null}

          {step === "who" ? (
            <>
              <button type="button" className="jb-back-link" onClick={() => setStep("when")}>
                ← Cambiar horario
              </button>
              <p className="jb-recap">
                {DAYS[day.getDay()]} {day.getDate()} de {MONTHS[day.getMonth()]}, {time} ·{" "}
                {money(total, detail.currency)}
              </p>
              <label className="jb-field">
                <span>Nombre</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="Tu nombre"
                  aria-invalid={touched && !nameValid}
                />
                {touched && !nameValid ? <em>Escribí tu nombre para confirmar.</em> : null}
              </label>
              <label className="jb-field">
                <span>
                  WhatsApp <i>opcional</i>
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched(true)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Para avisarte de cualquier cambio"
                  aria-invalid={touched && !phoneValid}
                />
                {touched && !phoneValid ? <em>Revisá el número.</em> : null}
              </label>
              <label className="jb-field">
                <span>Correo</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Para enviarte la confirmación"
                  aria-invalid={touched && !emailValid}
                />
                {touched && !emailValid ? <em>Necesitamos un correo válido.</em> : null}
              </label>
              <p className="jb-fixture">No se cobra nada ahora. El pago se realiza en el estudio.</p>
              <button
                type="button"
                className="jb-ask"
                onClick={() => {
                  askQuestion({
                    talentName: "Jorg Beauty",
                    sourcePage: "/dev/jor-beauty",
                    offering: { id: detail.offeringId, title: detail.title },
                    from: "sheet",
                  });
                }}
              >
                ¿Tenés una duda? Preguntá antes de reservar →
              </button>
              {error ? <p className="jb-error">{error}</p> : null}
            </>
          ) : null}

          {step === "done" ? (
            <div className="jb-done">
              <div className="jb-check" aria-hidden="true">
                ✓
              </div>
              <h3>
                {DAYS[day.getDay()]} {day.getDate()} de {MONTHS[day.getMonth()]}, {time}
              </h3>
              <p>
                {detail.title}
                {variant ? ` · ${variant.label}` : ""}
                {extras.length ? ` · ${extras.map((e) => e.label).join(", ")}` : ""} ·{" "}
                {money(total, detail.currency)}
              </p>
              <p className="jb-fixture">
                {isRequest
                  ? "Queda pendiente de confirmación: Jorgelina revisa la solicitud y te responde."
                  : "Recibirás la dirección completa del estudio junto con la confirmación."}
              </p>
              <p className="jb-demo">
                Demostración: en el perfil real esta cita entra al calendario del panel y el mensaje
                sale por la bandeja de Tulala. Aquí no se guarda nada.
              </p>
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
              disabled={needsVariant && !variant}
              onClick={() => setStep("when")}
            >
              {needsVariant && !variant ? "Elegí una opción" : "Continuar: elegir horario"}
            </button>
          ) : null}
          {step === "when" ? (
            <button type="button" className="jb-cta" disabled={!time} onClick={() => setStep("who")}>
              Continuar
            </button>
          ) : null}
          {step === "who" ? (
            <button type="button" className="jb-cta" disabled={busy} onClick={confirm}>
              {busy ? "Enviando…" : isRequest ? "Enviar solicitud" : "Confirmar cita"}
            </button>
          ) : null}
          {step === "done" ? (
            <button type="button" className="jb-cta" onClick={() => setDetail(null)}>
              Listo
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
