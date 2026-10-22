"use client";

/**
 * session_picker — the public block a visitor takes a seat at a class from.
 *
 * A list of dates with seats left, and a seat. No calendar, no tier picker: a
 * visitor picks a night and says how many, and everything else is the operator's
 * business. That is enough to open a studio with.
 *
 * WHY THE ACTIONS ARE IMPORTED DYNAMICALLY. `session-picker-actions.ts` is a
 * `"use server"` file; a static import would pull it into the client bundle.
 * The menu board and the reserve block do the same thing for the same reason.
 *
 * WHY IT SELF-FETCHES rather than taking server-resolved `dataSources` like
 * `menu_board`. Seats change between a page being rendered and a visitor
 * tapping, so a count resolved at server-render is stale the moment it is
 * painted — and a stale count on a *sold-out* class is a visitor who fills in a
 * form to be told no. `reserve_table` is the precedent, and
 * `native-data-blocks.test.ts:136` records the reasoning.
 *
 * WHY THERE IS NO ENDPOINT. `surface-allow-list.ts` gates paths per host kind
 * before Next routing, so a new `/api/...` route 404s until allow-listed, and
 * that file is frozen at its lint cap. A server action posts to the page's own
 * URL, so this block adds no surface at all.
 *
 * REFUSALS ARE SENTENCES. "That class just filled up" and "we could not reach
 * the seat count" are different things to be told, and a visitor who reads the
 * wrong one thinks the studio is full when the studio is fine.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { PickerOffering, PickerSession } from "@/app/(public)/_sessions/session-picker-actions";
import { money } from "./ticket-picker-copy";

type Locale = "en" | "es";

function pickLocale(raw?: string): Locale {
  return raw?.toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * Per CART, not per click. A double-tapped button must produce ONE order, and
 * this key is what makes the second call idempotent rather than a second seat.
 * Regenerated only when the visitor starts a different booking.
 */
function newOrderKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
  }
}

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    heading: "Pick a date",
    chooseClass: "Class",
    loading: "Loading dates...",
    none: "No dates are open just now.",
    seatsLeft: "{n} left",
    soldOut: "Sold out",
    noSeats: "Not on sale",
    email: "Email",
    name: "Name",
    seats: "Seats",
    book: "Book",
    bookAndPay: "Book and pay",
    booking: "Taking your seat...",
    redirecting: "Opening payment...",
    perPerson: "{price} per person",
    total: "Total {price}",
    // Shown only for a FREE booking: nothing is paid and no ticket email is sent, so it claims no email.
    done: "Done, your spot is booked.",
    currency_unsupported: "This class cannot be paid online in its currency right now. Nothing was charged. Please contact the studio.",
    pay_error: "We could not open the payment page. Press the button to try again.",
    emailRequired: "We need an email to send your place to.",
    // Refusals, each its own sentence. A visitor who reads the wrong one goes
    // somewhere else.
    sold_out: "That class just filled up. Pick another date and it is yours.",
    session_not_found: "That date is no longer on the schedule. Pick another.",
    no_seats_configured: "Seats for that date are not on sale yet.",
    not_sellable: "This class is not on sale just now.",
    unavailable: "We could not reach the seat count. Nothing was booked. Try again.",
    not_configured: "This session picker has not been set up yet. Open it in the editor and choose a class.",
    invalid_request: "Something in that did not look right. Check the details and try again.",
    engine_error: "Something went wrong at our end. Nothing was booked.",
  },
  es: {
    heading: "Elige una fecha",
    chooseClass: "Clase",
    loading: "Cargando fechas...",
    none: "No hay fechas abiertas por ahora.",
    seatsLeft: "quedan {n}",
    soldOut: "Agotado",
    noSeats: "No esta a la venta",
    email: "Correo",
    name: "Nombre",
    seats: "Plazas",
    book: "Reservar",
    bookAndPay: "Reservar y pagar",
    booking: "Reservando tu plaza...",
    redirecting: "Abriendo el pago...",
    perPerson: "{price} por persona",
    total: "Total {price}",
    done: "Listo, tu lugar está reservado.",
    currency_unsupported: "Esta clase no se puede pagar en línea en su moneda por ahora. No se cobró nada. Escribe al estudio.",
    pay_error: "No pudimos abrir la página de pago. Pulsa el botón para intentar de nuevo.",
    emailRequired: "Necesitamos un correo para enviarte tu plaza.",
    sold_out: "Esa clase acaba de llenarse. Elige otra fecha y es tuya.",
    session_not_found: "Esa fecha ya no esta en el horario. Elige otra.",
    no_seats_configured: "Las plazas de esa fecha aun no estan a la venta.",
    not_sellable: "Esta clase no esta a la venta por ahora.",
    unavailable: "No pudimos consultar las plazas. No se reservo nada. Intenta de nuevo.",
    not_configured: "Este selector de sesiones aun no esta configurado. Ábrelo en el editor y elige una clase.",
    invalid_request: "Algo no se ve bien. Revisa los datos e intenta de nuevo.",
    engine_error: "Algo fallo de nuestro lado. No se reservo nada.",
  },
};

export interface SessionPickerIslandProps {
  tenantId: string;
  offeringId: string;
  title?: string;
  locale?: string;
  /** Test seam only: production uses the dynamic import and window.location. */
  deps?: {
    loadActions?: () => Promise<typeof import("@/app/(public)/_sessions/session-picker-actions")>;
    navigate?: (url: string) => void;
  };
}

/** What the guest does after `bookSessionSeat` answers ok. Paid orders go to Stripe; only a free one is "done". */
export function nextStepAfterBook(
  result: { checkoutTransactionId: string | null },
  amountCents: number | null,
): "pay" | "done" {
  return result.checkoutTransactionId && (amountCents ?? 0) > 0 ? "pay" : "done";
}

/** The venue's clock, not the reader's — a class happens where it happens. */
/**
 * The venue's clock, with the zone NAMED, or nothing.
 *
 * `timeZone` is required rather than `string | null`, and the spread that used
 * to omit it is gone. Omitting the key does not render "no zone" — it renders
 * the READER'S zone, silently. That is how a 21:00 Monday class in Buenos
 * Aires displays as Tuesday to somebody in Madrid, with nothing on the page
 * suggesting anything is wrong. A wrong time is worse than an absent one: the
 * absent one gets reported and the wrong one gets believed, and a class that
 * names the wrong day sends somebody to a locked door.
 *
 * The zone is also SHOWN, because "18:00" alone is ambiguous to anyone reading
 * it somewhere else, and a customer who has to work out which clock a time is
 * in has already been failed. Same rule as the reminder email.
 *
 * Returns null on a bad instant or an unusable zone rather than falling back to
 * the raw ISO string: an unformattable date is not a date a customer should be
 * asked to choose between.
 */
function formatWhen(iso: string, timeZone: string, locale: Locale): string | null {
  try {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    const when = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(at);
    const zoneLabel =
      new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
        timeZone,
        timeZoneName: "short",
      })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? timeZone;
    return `${when} (${zoneLabel})`;
  } catch {
    return null;
  }
}

/**
 * TUL-1810: the block shipped with browser-default controls, so on a phone the
 * inputs had no visible border, "Reservar y pagar" read as plain text and the
 * refusal was grey body copy. These use the site's design tokens (ink / line /
 * background), so the block follows the site's theme.
 */
const FIELD_STYLE: CSSProperties = {
  boxSizing: "border-box",
  marginLeft: 8,
  minHeight: 44,
  padding: "8px 12px",
  font: "inherit",
  color: "var(--token-color-ink)",
  background: "var(--token-color-surface-raised, var(--token-color-background))",
  border: "1px solid var(--token-color-line)",
  borderRadius: 10,
};
const BUTTON_STYLE: CSSProperties = {
  marginTop: 12,
  minHeight: 48,
  width: "100%",
  padding: "12px 20px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  color: "var(--token-color-background)",
  background: "var(--token-color-ink)",
  border: "1px solid var(--token-color-ink)",
  borderRadius: 999,
};
const REFUSAL_STYLE: CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  color: "var(--token-color-danger, firebrick)",
  background: "color-mix(in srgb, var(--token-color-danger, firebrick) 8%, var(--token-color-background, white))",
  border: "1px solid color-mix(in srgb, var(--token-color-danger, firebrick) 45%, transparent)",
  borderRadius: 10,
};

export function SessionPickerIsland({
  tenantId,
  offeringId,
  title,
  locale,
  deps,
}: SessionPickerIslandProps) {
  const loc = pickLocale(locale);
  const t = (key: string) => COPY[loc][key] ?? COPY.en[key] ?? key;

  const getActions = useCallback(
    () => (deps?.loadActions ? deps.loadActions() : import("@/app/(public)/_sessions/session-picker-actions")),
    [deps],
  );
  const [sessions, setSessions] = useState<PickerSession[] | null>(null);
  const [price, setPrice] = useState<{ amountCents: number | null; currency: string }>({ amountCents: null, currency: "USD" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orderKey, setOrderKey] = useState<string>(() => newOrderKey());
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [boundOfferingId, setBoundOfferingId] = useState<string | null>(
    offeringId.trim() || null,
  );
  const [hidden, setHidden] = useState(false);
  // TUL-1381: with no configured class, every class that has dates is listed and
  // the guest picks one. Price, currency and dates then come from THAT class.
  const loadSeq = useRef(0);
  const [classes, setClasses] = useState<PickerOffering[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);

  // NOT CONFIGURED IS NOT AN OUTAGE.
  //
  // The renderer passes `tenantId={options.dataSources.tenantId ?? ""}`, so a
  // block placed on a page with no tenant in its data sources arrives here with
  // an empty string. That string is already refused — both actions parse
  // `z.string().uuid()`, so it dies at the schema and never reaches a query, and
  // the tenant-scoped read behind it is the second line rather than the first.
  //
  // The defect is what the refusal SAYS. Without this guard it renders as
  // "we could not reach the seat count", which is exactly what a real outage
  // renders, and the author who mis-placed the block goes looking for a fault
  // in the engine. A configuration mistake wearing a runtime symptom's clothes
  // is the `?? ""` sentinel's actual cost here.
  //
  // Checked in the island rather than in the action because only the island
  // knows the difference between "nobody configured me" and "my caller sent
  // something wrong": the action sees one empty string either way.
  const load = useCallback(async () => {
    const tenant = (tenantId ?? "").trim();
    if (!tenant) {
      setSessions([]);
      setRefusal(t("not_configured"));
      return;
    }
    try {
      const actions = await getActions();
      let offering = (offeringId ?? "").trim();
      if (!offering) {
        const listed = await actions.listSessionPickerOfferings({ tenantId: tenant });
        if (!listed.ok) {
          setHidden(true);
          setSessions([]);
          return;
        }
        setClasses(listed.offerings);
        offering =
          (pickedId && listed.offerings.find((o) => o.id === pickedId)?.id) || listed.offerings[0].id;
        setBoundOfferingId(offering);
      }
      setHidden(false);
      const seq = ++loadSeq.current;
      const result = await actions.loadSessionPicker({ tenantId: tenant, offeringId: offering });
      // A slower answer for a class the guest has since left must not overwrite the current one.
      if (seq !== loadSeq.current) return;
      if (result.ok) {
        setSessions(result.sessions);
        setPrice({ amountCents: result.amountCents, currency: result.currency });
      } else {
        setSessions([]);
        setRefusal(t(result.reason));
      }
    } catch {
      // A rejected action must not leave the block loading for ever with
      // nothing said — indistinguishable from a slow server.
      setSessions([]);
      setRefusal(t("unavailable"));
    }
  }, [tenantId, offeringId, pickedId, loc, getActions]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseClass(id: string) {
    if (id === (boundOfferingId ?? "")) return;
    // A different class is a different cart: its dates, price and currency replace the old ones.
    setPickedId(id);
    setBoundOfferingId(id);
    setChosen(null);
    setSessions(null);
    setPrice({ amountCents: null, currency: classes.find((o) => o.id === id)?.currency ?? "" });
    setRefusal(null);
    setOrderKey(newOrderKey());
  }

  async function book() {
    if (!chosen || busy) return;
    if (!email.trim()) {
      setRefusal(t("emailRequired"));
      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const { bookSessionSeat, startSessionCardPayment } = await getActions();
      const result = await bookSessionSeat({
        tenantId,
        offeringId: boundOfferingId ?? offeringId,
        sessionId: chosen,
        units: seats,
        clientOrderKey: orderKey,
        email: email.trim(),
        displayName: name.trim() || undefined,
        locale: loc,
      });
      if (result.ok) {
        if (nextStepAfterBook(result, price.amountCents) === "pay" && result.checkoutTransactionId) {
          // Paid: straight to Stripe. NEVER the done screen here, and no claim
          // of an email: the ticket is sent by the paid webhook, after payment.
          setRedirecting(true);
          const pay = await startSessionCardPayment({
            tenantId,
            orderId: result.orderId,
            transactionId: result.checkoutTransactionId,
            locale: loc,
          });
          if (pay.ok) {
            (deps?.navigate ?? ((u: string) => window.location.assign(u)))(pay.url);
            return;
          }
          // The order exists under this cart key, so the key is kept: the retry
          // is idempotent and reuses the same order and transaction.
          setRedirecting(false);
          setRefusal(t(pay.reason === "currency_unsupported" ? "currency_unsupported" : "pay_error"));
          return;
        }
        setDone(true);
        return;
      }
      setRefusal(t(result.reason));
      // A NEW cart after a refusal. Reusing the key would make the retry
      // idempotent against the failed attempt and silently do nothing.
      setOrderKey(newOrderKey());
      // Seats moved under us, so the list on screen is now a lie.
      void load();
    } catch {
      setRefusal(t("engine_error"));
      setOrderKey(newOrderKey());
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  if (done) {
    return (
      <div data-session-picker="done" style={{ padding: 16 }}>
        {t("done")}
      </div>
    );
  }

  return (
    <div data-session-picker="root" style={{ padding: 16 }}>
      {title ? <h3 style={{ margin: "0 0 4px" }}>{title}</h3> : null}
      {classes.length > 1 ? (
        <label style={{ display: "block", margin: "0 0 12px" }}>
          {t("chooseClass")}
          <select
            data-session-picker="class"
            value={boundOfferingId ?? ""}
            onChange={(e) => chooseClass(e.target.value)}
            style={FIELD_STYLE}
          >
            {classes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div style={{ margin: "0 0 12px", fontWeight: 600 }}>{t("heading")}</div>

      {sessions === null ? (
        <div>{t("loading")}</div>
      ) : sessions.length === 0 ? (
        <div>{t("none")}</div>
      ) : (
        <div role="radiogroup" aria-label={t("heading")}>
          {sessions.map((s) => {
            // A session whose instant cannot be rendered in its own zone is not
            // offered at all. The server already drops sessions with no zone;
            // this is the second half of the same rule, so an unformattable
            // instant cannot become a radio button a customer picks blind.
            const when = formatWhen(s.startsAt, s.timeZone, loc);
            if (!when) return null;

            // Three states, not two: on sale, sold out, and NOT ON SALE — a
            // session with no pool sells nothing and must not read as available.
            const unavailable = s.soldOut || s.seatsRemaining === null;
            const label =
              s.seatsRemaining === null
                ? t("noSeats")
                : s.soldOut
                  ? t("soldOut")
                  : t("seatsLeft").replace("{n}", String(s.seatsRemaining));
            return (
              <label
                key={s.id}
                style={{ display: "block", margin: "0 0 8px", opacity: unavailable ? 0.55 : 1 }}
              >
                <input
                  type="radio"
                  name="session"
                  value={s.id}
                  disabled={unavailable}
                  checked={chosen === s.id}
                  onChange={() => setChosen(s.id)}
                />{" "}
                {when} · {label}
              </label>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block" }}>
          {t("seats")}
          <input
            type="number"
            min={1}
            max={20}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            style={{ ...FIELD_STYLE, width: 80 }}
          />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          {t("email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={FIELD_STYLE}
          />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          {t("name")}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={FIELD_STYLE}
          />
        </label>
      </div>

      {price.amountCents != null && price.amountCents > 0 ? (
        <div data-session-picker="price" style={{ marginTop: 12 }}>
          <div>
            {t("perPerson").replace("{price}", money(price.amountCents, price.currency, loc, ""))}
          </div>
          <div style={{ fontWeight: 600 }}>
            {t("total").replace("{price}", money(price.amountCents * seats, price.currency, loc, ""))}
          </div>
        </div>
      ) : null}

      {refusal ? (
        <div data-session-picker="refusal" role="alert" style={REFUSAL_STYLE}>
          {refusal}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void book()}
        disabled={!chosen || busy || redirecting}
        style={{ ...BUTTON_STYLE, opacity: !chosen || busy || redirecting ? 0.55 : 1 }}
      >
        {redirecting
          ? t("redirecting")
          : busy
            ? t("booking")
            : (price.amountCents ?? 0) > 0
              ? t("bookAndPay")
              : t("book")}
      </button>
    </div>
  );
}
