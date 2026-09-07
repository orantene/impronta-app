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

import { useCallback, useEffect, useState } from "react";

import type { PickerSession } from "@/app/(public)/_sessions/session-picker-actions";
import { pickerConfig } from "@/lib/sessions/picker-config";

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
    loading: "Loading dates...",
    none: "No dates are open just now.",
    seatsLeft: "{n} left",
    soldOut: "Sold out",
    noSeats: "Not on sale",
    email: "Email",
    name: "Name",
    seats: "Seats",
    book: "Take a seat",
    booking: "Taking your seat...",
    done: "You are in. Check your email for the details.",
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
    loading: "Cargando fechas...",
    none: "No hay fechas abiertas por ahora.",
    seatsLeft: "quedan {n}",
    soldOut: "Agotado",
    noSeats: "No esta a la venta",
    email: "Correo",
    name: "Nombre",
    seats: "Plazas",
    book: "Reservar plaza",
    booking: "Reservando tu plaza...",
    done: "Listo. Revisa tu correo para los detalles.",
    emailRequired: "Necesitamos un correo para enviarte tu plaza.",
    sold_out: "Esa clase acaba de llenarse. Elige otra fecha y es tuya.",
    session_not_found: "Esa fecha ya no esta en el horario. Elige otra.",
    no_seats_configured: "Las plazas de esa fecha aun no estan a la venta.",
    not_sellable: "Esta clase no esta a la venta por ahora.",
    unavailable: "No pudimos consultar las plazas. No se reservo nada. Intenta de nuevo.",
    not_configured: "Este selector de sesiones aun no esta configurado. Abrelo en el editor y elige una clase.",
    invalid_request: "Algo no se ve bien. Revisa los datos e intenta de nuevo.",
    engine_error: "Algo fallo de nuestro lado. No se reservo nada.",
  },
};

export interface SessionPickerIslandProps {
  tenantId: string;
  offeringId: string;
  title?: string;
  locale?: string;
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

export function SessionPickerIsland({
  tenantId,
  offeringId,
  title,
  locale,
}: SessionPickerIslandProps) {
  const loc = pickLocale(locale);
  const t = (key: string) => COPY[loc][key] ?? COPY.en[key] ?? key;

  const [sessions, setSessions] = useState<PickerSession[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orderKey, setOrderKey] = useState<string>(() => newOrderKey());
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
  const configured = pickerConfig(tenantId, offeringId).ok;

  const load = useCallback(async () => {
    if (!configured) {
      setSessions([]);
      setRefusal(t("not_configured"));
      return;
    }
    try {
      const { loadSessionPicker } = await import(
        "@/app/(public)/_sessions/session-picker-actions"
      );
      const result = await loadSessionPicker({ tenantId, offeringId });
      if (result.ok) setSessions(result.sessions);
      else {
        setSessions([]);
        setRefusal(t(result.reason));
      }
    } catch {
      // A rejected action must not leave the block loading for ever with
      // nothing said — indistinguishable from a slow server.
      setSessions([]);
      setRefusal(t("unavailable"));
    }
  }, [tenantId, offeringId, loc, configured]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book() {
    if (!chosen || busy) return;
    if (!email.trim()) {
      setRefusal(t("emailRequired"));
      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const { bookSessionSeat } = await import(
        "@/app/(public)/_sessions/session-picker-actions"
      );
      const result = await bookSessionSeat({
        tenantId,
        offeringId,
        sessionId: chosen,
        units: seats,
        clientOrderKey: orderKey,
        email: email.trim(),
        displayName: name.trim() || undefined,
        locale: loc,
      });
      if (result.ok) {
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
            style={{ marginLeft: 8, width: 64 }}
          />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          {t("email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginLeft: 8 }}
          />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          {t("name")}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ marginLeft: 8 }}
          />
        </label>
      </div>

      {refusal ? (
        <div data-session-picker="refusal" style={{ marginTop: 12 }}>
          {refusal}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void book()}
        disabled={!chosen || busy}
        style={{ marginTop: 12 }}
      >
        {busy ? t("booking") : t("book")}
      </button>
    </div>
  );
}
