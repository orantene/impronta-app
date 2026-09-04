"use client";

/**
 * reserve_table — the public block a guest books a table from.
 *
 * Party, date, window, time. No floor plan and no table picking: a guest books
 * "a table for four at eight", and which table that becomes is the host's job
 * at the door. That is band mode, and it is enough to open a restaurant with.
 *
 * WHY THE ACTION IS IMPORTED DYNAMICALLY. `reserve-actions.ts` is a "use server"
 * file; a static import would pull it into the client bundle. The public menu
 * board does the same thing for the same reason.
 *
 * WHY THERE IS NO ENDPOINT. `surface-allow-list.ts` gates paths per host kind
 * before Next routing, so a new `/api/...` route 404s until it is allow-listed,
 * and that file is at its lint cap and frozen. A server action posts to the
 * page's own URL, so this block adds no new surface at all.
 *
 * REFUSALS ARE SENTENCES, NOT AN EMPTY GRID. "We have no table that size", "we
 * are closed that day" and "too late for tonight" are different things to be
 * told, and a guest who reads the wrong one goes somewhere else.
 */

import { useEffect, useState } from "react";
import type { ReserveAvailability, ReserveSlot } from "@/app/(public)/_reserve/reserve-actions";

/**
 * Per CART, not per click. A double-tapped Reserve button must produce ONE
 * booking, and the key is what makes the second call idempotent rather than a
 * second table. Regenerated only when the guest starts a different booking.
 */
function newOrderKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // A browser without randomUUID still needs a stable key for this cart.
    const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
  }
}

type Props = {
  tenantId: string;
  venueName: string;
  /** The tenant's word for this: reservation, appointment, booking, agenda. */
  ctaVerb?: string;
  partyMin?: number;
  partyMax?: number;
  /** Rendered above the button when the venue asks for a card. */
  cardNotice?: string | null;
  /** The venue allows a note on the reserve step. */
  notesEnabled?: boolean;
  /** The page's content locale. Everything a guest reads has en and es. */
  locale?: string;
  onAskFirst?: () => void;
};

/**
 * A refused BOOKING says something different from a refused SEARCH. "That time
 * just went" is the one that matters: between the page rendering and the guest
 * tapping, someone else can take the last four-top, and telling them that
 * plainly is better than a generic failure they will read as our fault.
 */
type Locale = "en" | "es";

const SUBMIT_REFUSAL_COPY: Record<Locale, Record<string, string>> = {
  en: {
    time_not_offered: "That time just went. Pick another and we will hold it.",
    sold_out: "Somebody took the last table for that time. Try another.",
    capacity_unavailable: "We could not reach the book just now. Nothing was booked. Try again.",
    no_offering_configured: "This restaurant is not taking bookings online yet.",
    reservations_off: "This restaurant is not taking bookings online right now.",
    no_contact: "We need an email to hold the table.",
    invalid_request: "Something about that booking did not look right. Try again.",
    engine_error: "We could not complete that just now. Nothing was booked.",
    unavailable: "We could not reach the book just now. Nothing was booked.",
  },
  es: {
    time_not_offered: "Esa hora se acaba de ocupar. Elige otra y te la guardamos.",
    sold_out: "Alguien tomó la última mesa a esa hora. Prueba con otra.",
    capacity_unavailable: "No pudimos consultar la agenda en este momento. No se reservó nada. Inténtalo de nuevo.",
    no_offering_configured: "Este restaurante todavía no acepta reservas en línea.",
    reservations_off: "Este restaurante no está aceptando reservas en línea por ahora.",
    no_contact: "Necesitamos un correo para guardarte la mesa.",
    invalid_request: "Algo en esa reserva no se veía bien. Inténtalo de nuevo.",
    engine_error: "No pudimos completarla en este momento. No se reservó nada.",
    unavailable: "No pudimos consultar la agenda en este momento. No se reservó nada.",
  },
};

const REFUSAL_COPY: Record<Locale, Record<string, string>> = {
  en: {
    reservations_off: "This restaurant is not taking bookings online right now.",
    closed: "We are closed that day.",
    party_below_minimum: "That party is smaller than we take online.",
    party_above_maximum: "For a party that size, message us and we will sort it out.",
    no_band_fits_this_party: "We have no table that size. Message us and we will see what we can do.",
    beyond_booking_horizon: "That is further ahead than we take bookings.",
    inside_minimum_notice: "Too late to book that online. Message us and we will see what we can do.",
    fully_booked: "Fully booked that day. Try another date, or message us.",
    unavailable: "We could not load the times just now. Try again in a moment.",
  },
  es: {
    reservations_off: "Este restaurante no está aceptando reservas en línea por ahora.",
    closed: "Ese día cerramos.",
    party_below_minimum: "Ese grupo es más pequeño de lo que aceptamos en línea.",
    party_above_maximum: "Para un grupo así, escríbenos y lo resolvemos.",
    no_band_fits_this_party: "No tenemos una mesa de ese tamaño. Escríbenos y vemos qué podemos hacer.",
    beyond_booking_horizon: "Eso es más adelante de lo que aceptamos reservas.",
    inside_minimum_notice: "Ya es tarde para reservar eso en línea. Escríbenos y vemos qué podemos hacer.",
    fully_booked: "Ese día está lleno. Prueba otra fecha, o escríbenos.",
    unavailable: "No pudimos cargar los horarios en este momento. Inténtalo en un momento.",
  },
};

/**
 * The block's own words. Sentences, not nouns: the NOUN for a table is the
 * tenant's (`ctaVerb` and the words layer own that), but the sentence telling a
 * guest what happened to their booking is not something a rename may rewrite.
 */
const UI: Record<Locale, Record<string, string>> = {
  en: {
    heading: "a table",
    partyOf: "Party of",
    fewer: "Fewer people",
    more: "More people",
    today: "Today",
    checking: "Checking the book…",
    lastTable: "last table",
    name: "Name",
    email: "Email",
    note: "Anything we should know?",
    noteAria: "Special requests",
    booking: "Booking",
    pickTime: "Pick a time",
    bookedFor: "You are booked for",
    nothingToPay: "Nothing to pay now. We have sent a confirmation to your email.",
  },
  es: {
    heading: "una mesa",
    partyOf: "Personas",
    fewer: "Menos personas",
    more: "Más personas",
    today: "Hoy",
    checking: "Consultando la agenda…",
    lastTable: "última mesa",
    name: "Nombre",
    email: "Correo",
    note: "¿Algo que debamos saber?",
    noteAria: "Peticiones especiales",
    booking: "Reservando",
    pickTime: "Elige una hora",
    bookedFor: "Tu reserva es para",
    nothingToPay: "No hay nada que pagar ahora. Te enviamos la confirmación por correo.",
  },
};

/**
 * A deposit line, in the reader's language and with the amount formatted for
 * it. Money is integer cents everywhere behind this; this is the only place it
 * becomes a sentence.
 */
export function depositLine(locale: Locale, cents: number): string {
  const amount = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
  return locale === "es"
    ? `Se requiere un depósito de ${amount}; te enviamos el enlace.`
    : `A deposit of ${amount} is due; we have sent you the link.`;
}

/**
 * A date chip, in the VENUE's zone and the reader's language.
 *
 * The zone is not decoration. `Intl` given a bare Date formats in the reader's
 * zone, so a Cancun venue read from Madrid would label the wrong night — and
 * because a ymd has no time, the parsed midnight lands on the previous day for
 * any reader west of UTC unless the zone is named. Both are named here.
 */
export function dayLabel(ymd: string, timeZone: string, locale: Locale, isToday: boolean): string {
  if (isToday) return UI[locale].today;
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    weekday: "short",
    day: "numeric",
    timeZone,
  }).format(d);
}

const C = {
  ink: "#0B0B0D",
  muted: "rgba(11,11,13,0.55)",
  dim: "rgba(11,11,13,0.35)",
  line: "rgba(24,24,27,0.12)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  card: "#ffffff",
} as const;

const chip = (on: boolean): React.CSSProperties => ({
  border: `1px solid ${on ? C.accent : C.line}`,
  background: on ? C.accentSoft : C.card,
  color: on ? C.accent : C.muted,
  fontWeight: on ? 600 : 400,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13.5,
  cursor: "pointer",
  textAlign: "center",
});

export function ReserveTableIsland({
  tenantId,
  venueName,
  ctaVerb = "Reserve",
  partyMin = 1,
  partyMax = 8,
  cardNotice = null,
  notesEnabled = true,
  locale: localeProp,
  onAskFirst,
}: Props) {
  const locale: Locale = localeProp === "es" ? "es" : "en";
  const t = UI[locale];

  const [party, setParty] = useState(Math.min(2, partyMax));
  // NULL means "the venue decides what today is", and the first load asks it.
  // The browser's calendar is not the venue's: a guest in Madrid at 01:00 is on
  // tomorrow's date while a Cancun kitchen is still serving tonight, and the
  // old code built this strip from `new Date()` — so it offered the wrong five
  // days and called the wrong one Today. Dates now come back from the server in
  // the venue's zone and this holds only the guest's CHOICE among them.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<ReserveSlot | null>(null);
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; data: ReserveAvailability }
  >({ status: "loading" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [orderKey, setOrderKey] = useState(newOrderKey);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ label: string; collectCents: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);


  // No useCallback. The React Compiler refuses to preserve a manual memo whose
  // dependency it cannot prove stable, and `onDate` derives from a `dates`
  // array rebuilt every render — so the memo was never buying anything and the
  // compiler said so. The effect owns the fetch, keyed on three primitives.
  //
  // `cancelled` is not ceremony: a guest tapping party sizes fires overlapping
  // loads, and without it a slow first response lands after a fast second one
  // and shows times for a party they are no longer booking.
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setSlot(null);
    void (async () => {
      try {
        const { loadReserveAvailability } = await import(
          "@/app/(public)/_reserve/reserve-actions"
        );
        const data = await loadReserveAvailability({
          tenantId,
          partySize: party,
          // Omitted on the first load, so the venue names its own today.
          ...(selectedDate ? { onDate: selectedDate } : {}),
        });
        if (cancelled) return;
        setState({ status: "ready", data });
        if (data.ok) {
          setWindowKey((k) =>
            data.windows.some((w) => w.key === k) ? k : (data.windows[0]?.key ?? null),
          );
        }
      } catch {
        if (cancelled) return;
        // A thrown load knows nothing about the venue, so it carries no dates
        // and no zone. That is the honest shape: the strip disappears and the
        // panel says we could not reach the book, rather than showing five days
        // this browser invented.
        setState({
          status: "ready",
          data: { ok: false, timezone: null, onDate: null, dates: [], reason: "unavailable" },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, party, selectedDate]);

  const available = state.status === "ready" && state.data.ok ? state.data : null;
  const shown = available?.windows.find((w) => w.key === windowKey) ?? available?.windows[0];
  // The date strip rides on BOTH branches, so "we are closed that day" still
  // leaves the guest able to pick a different day. Empty only when we never
  // reached the venue — a different sentence, and the panel says that one.
  const ctx = state.status === "ready" ? state.data : null;
  const dates = ctx?.dates ?? [];
  const activeDate = selectedDate ?? ctx?.onDate ?? null;

  return (
    <div style={{ maxWidth: 460, fontFamily: "Inter, system-ui, sans-serif" }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: C.dim,
          margin: "0 0 6px",
        }}
      >
        {venueName}
      </p>
      <h2 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 18px", color: C.ink }}>
        {ctaVerb} {t.heading}
      </h2>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, color: C.muted }}>{t.partyOf}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => setParty((p) => Math.max(partyMin, p - 1))}
            style={{ ...chip(false), width: 36 }}
            aria-label={t.fewer}
          >
            &minus;
          </button>
          <span
            style={{ fontSize: 19, minWidth: 26, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
            aria-live="polite"
          >
            {party}
          </span>
          <button
            type="button"
            onClick={() => setParty((p) => Math.min(partyMax, p + 1))}
            style={{ ...chip(false), width: 36 }}
            aria-label={t.more}
          >
            +
          </button>
        </div>
      </div>

      {dates.length > 0 && ctx?.timezone ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 14 }}>
          {dates.map((ymd, i) => (
            <button
              key={ymd}
              type="button"
              style={chip(ymd === activeDate)}
              onClick={() => setSelectedDate(ymd)}
              aria-pressed={ymd === activeDate}
            >
              {dayLabel(ymd, ctx.timezone!, locale, i === 0)}
            </button>
          ))}
        </div>
      ) : null}

      {available && available.windows.length > 1 ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {available.windows.map((w) => (
            <button
              key={w.key}
              type="button"
              style={{ ...chip(w.key === shown?.key), flex: 1, textTransform: "capitalize" }}
              onClick={() => {
                setWindowKey(w.key);
                setSlot(null);
              }}
              aria-pressed={w.key === shown?.key}
            >
              {w.key}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ minHeight: 84, marginBottom: 14 }} aria-live="polite">
        {state.status === "loading" ? (
          <p style={{ fontSize: 13.5, color: C.dim, margin: 0 }}>{t.checking}</p>
        ) : state.data.ok && shown ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {shown.slots.map((s) => (
              <button
                key={s.startsAtIso}
                type="button"
                style={{ ...chip(slot?.startsAtIso === s.startsAtIso), lineHeight: 1.25 }}
                onClick={() => setSlot(s)}
                aria-pressed={slot?.startsAtIso === s.startsAtIso}
              >
                {s.label}
                {s.isLastSeating ? (
                  <>
                    <br />
                    <span style={{ fontSize: 10, color: "#8A6A00" }}>{t.lastTable}</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            {REFUSAL_COPY[locale][state.data.ok ? "unavailable" : state.data.reason] ??
              REFUSAL_COPY[locale].unavailable}
          </p>
        )}
      </div>

      {/* Shown only when the venue actually asks for a card, and it says what
          will and will not be charged. A guest who is surprised at the door is
          a guest who does not come back. */}
      {cardNotice ? (
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
          {cardNotice}
        </p>
      ) : null}

      {/* Who. Asked for only once a time is chosen, so the page is a price
          list until the guest has actually decided something. */}
      {slot ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.name}
            aria-label={t.name}
            style={{ padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.email}
            type="email"
            aria-label={t.email}
            style={{ padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }}
          />
          {notesEnabled ? (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.note}
              aria-label={t.noteAria}
              style={{ padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }}
            />
          ) : null}
        </div>
      ) : null}

      {done ? (
        <div
          role="status"
          style={{
            border: `1px solid ${C.accent}`,
            background: C.accentSoft,
            borderRadius: 10,
            padding: "14px 16px",
            fontSize: 14,
            lineHeight: 1.6,
            color: C.accent,
          }}
        >
          <strong>{t.bookedFor} {done.label}.</strong>
          <br />
          {done.collectCents > 0 ? depositLine(locale, done.collectCents) : t.nothingToPay}
        </div>
      ) : (
        <>
          {submitError ? (
            <p role="alert" style={{ fontSize: 13, color: "#A8471B", margin: "0 0 10px" }}>
              {SUBMIT_REFUSAL_COPY[locale][submitError] ??
                SUBMIT_REFUSAL_COPY[locale].engine_error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={!slot || !activeDate || submitting || !name.trim() || !email.trim()}
              onClick={async () => {
                // REFUSE rather than send a date we do not have. `activeDate`
                // is the venue's, and a booking posted without one would be
                // priced against whatever the server guessed — the exact
                // failure this change exists to remove.
                if (!slot || !activeDate) return;
                setSubmitting(true);
                setSubmitError(null);
                try {
                  const { submitReservation } = await import(
                    "@/app/(public)/_reserve/reserve-actions"
                  );
                  const result = await submitReservation({
                    tenantId,
                    partySize: party,
                    onDate: activeDate,
                    startsAtIso: slot.startsAtIso,
                    name: name.trim(),
                    email: email.trim(),
                    note: note.trim() || undefined,
                    clientOrderKey: orderKey,
                    sourcePage:
                      typeof window !== "undefined" ? window.location.pathname : null,
                  });
                  if (result.ok) {
                    setDone({ label: slot.label, collectCents: result.collectCents });
                  } else {
                    setSubmitError(result.reason);
                    // A refused booking starts a NEW cart. Reusing the key would
                    // make a retry idempotent against a booking that does not
                    // exist, and the guest would tap Reserve to no effect.
                    setOrderKey(newOrderKey());
                  }
                } catch {
                  setSubmitError("engine_error");
                  setOrderKey(newOrderKey());
                } finally {
                  setSubmitting(false);
                }
              }}
              style={{
                flex: 1,
                background: slot && !submitting ? C.accent : "rgba(11,11,13,0.08)",
                color: slot && !submitting ? "#fff" : C.dim,
                border: "none",
                borderRadius: 9,
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: slot && !submitting ? "pointer" : "default",
              }}
            >
              {submitting
                ? t.booking
                : slot
                  ? `${ctaVerb} ${locale === "es" ? "a las" : "at"} ${slot.label}`
                  : t.pickTime}
            </button>
            {onAskFirst ? (
              <button
                type="button"
                onClick={onAskFirst}
                style={{ ...chip(false), padding: "12px 16px" }}
              >
                Ask first
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
