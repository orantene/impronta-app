"use client";

/**
 * The reservation rules form.
 *
 * PRESET FIRST. Every field ships with a working default, so a venue can switch
 * reservations on without opening anything below the first group. The advanced
 * half stays collapsed: a barber must never need to read a turn-time table.
 *
 * THE FORM'S BOUNDS ARE A DISPLAY CONCERN. Everything here is re-derived and
 * re-checked server-side; a number that reaches the action is untrusted no
 * matter what the input said.
 *
 * NULL IS A VALUE HERE. "Never ask for a card" is a null threshold, not zero,
 * and the control is a checkbox plus a number rather than a number with a magic
 * 0, so the two states stay distinguishable in the UI as well as in the column.
 */

import { useState, useTransition } from "react";
import type { ServiceRules, ServiceWindow } from "@/lib/reservations";
import { reservationItemState } from "@/lib/reservations/reservation-item";
import { saveReservationRules } from "@/lib/server-actions/admin-reservation-rules";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.6)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.07)",
  danger: "#A8471B",
  ok: "#1A7348",
} as const;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 16,
        alignItems: "center",
        padding: "12px 0",
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>{label}</div>
        {hint ? (
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
            {hint}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{children}</div>
    </div>
  );
}

const numberStyle: React.CSSProperties = {
  width: 78,
  padding: "7px 9px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 14,
  fontVariantNumeric: "tabular-nums",
  color: C.ink,
  background: C.cardBg,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "6px 16px 10px",
        marginBottom: 16,
      }}
    >
      <h2
        style={{
          fontSize: 11,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: C.inkDim,
          margin: "14px 0 2px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

const ES_COPY: Record<string, string> = {
  "Taking reservations": "Reservas",
  "Reservations are on": "Las reservas están activas",
  "Guests can book from your site once a service window exists.": "Los clientes pueden reservar desde tu sitio cuando exista un horario de servicio.",
  "You can switch this on, but nothing is bookable until this venue has tables.": "Puedes activarlo, pero no se podrá reservar hasta que este local tenga mesas.",
  "Party size": "Tamaño del grupo",
  "Larger parties are sent to the chat instead.": "Los grupos más grandes se envían al chat.",
  "Smallest party": "Grupo más pequeño",
  "Largest party": "Grupo más grande",
  "Book ahead": "Reservar con anticipación",
  "How far in advance a guest may book.": "Con cuánta anticipación puede reservar un cliente.",
  "Days ahead": "Días de anticipación",
  "Minimum notice": "Aviso mínimo",
  "How close to the time a guest may still book.": "Qué tan cerca de la hora puede reservar aún un cliente.",
  "Minutes of notice": "Minutos de aviso",
  "Walk-ins": "Clientes sin reserva",
  "The host stand seats walk-ins against the same tables, so the book cannot oversell them.": "El anfitrión sienta a los clientes sin reserva en las mismas mesas, así que no se vende de más.",
  "Special requests": "Peticiones especiales",
  "A note field on the reserve step.": "Un campo de nota en el paso de reservar.",
  "No-shows and deposits": "Inasistencias y anticipos",
  "Card on file from": "Tarjeta en garantía desde",
  "A card holds the table. Nothing is charged unless the party does not arrive.": "Una tarjeta garantiza la mesa. No se cobra nada salvo que el grupo no llegue.",
  "Ask for a card on file": "Pedir tarjeta en garantía",
  "Card on file from this party size": "Tarjeta en garantía desde este tamaño de grupo",
  "No-show fee": "Cargo por inasistencia",
  "Charged after the grace period if the party has not been seated.": "Se cobra tras el periodo de gracia si el grupo no fue sentado.",
  "No-show fee in dollars": "Cargo por inasistencia en dólares",
  "No-show fee basis": "Base del cargo por inasistencia",
  "Grace period": "Periodo de gracia",
  "How long a table is held before the fee applies.": "Cuánto se guarda una mesa antes de aplicar el cargo.",
  "Grace minutes": "Minutos de gracia",
  "Deposit from": "Anticipo desde",
  "Taken at booking and applied to the bill.": "Se cobra al reservar y se descuenta de la cuenta.",
  "Take a deposit": "Cobrar un anticipo",
  "Deposit from this party size": "Anticipo desde este tamaño de grupo",
  "Deposit per person in dollars": "Anticipo por persona en dólares",
  "Free cancellation until": "Cancelación gratis hasta",
  "After this, a deposit is not returned.": "Después de esto, el anticipo no se devuelve.",
  "Free cancellation hours": "Horas de cancelación gratis",
  "Service windows": "Horarios de servicio",
  "Advanced": "Avanzado",
  "How long a table turns": "Duración de cada turno de mesa",
  "Used when no band below covers the party. A 90 minute turn makes 20:00 and 21:30 independent.": "Se usa cuando ninguna banda cubre al grupo. Un turno de 90 minutos hace independientes las 20:00 y las 21:30.",
  "Default turn minutes": "Minutos de turno por defecto",
  "Offer a bigger table online": "Ofrecer una mesa más grande en línea",
  "A party of two booking a four-top when the two-tops are gone. Your host can always do this at the door; this is about the website.": "Un grupo de dos reservando una mesa de cuatro cuando se acabaron las de dos. Tu anfitrión siempre puede hacerlo en la puerta; esto es sobre el sitio web.",
  "Waitlist": "Lista de espera",
  "Offer released tables. Needs SMS, which is not connected yet.": "Ofrece mesas liberadas. Requiere SMS, que aún no está conectado.",
};

export function ReservationSettingsForm({
  venueId,
  timezone,
  rules,
  windows,
  canGoLive,
  offerings,
  locale,
}: {
  venueId: string;
  timezone: string;
  rules: ServiceRules;
  windows: ServiceWindow[];
  canGoLive: boolean;
  offerings: Array<{ id: string; title: string; status: string }>;
  locale: "es" | "en";
}) {
  const es = locale === "es";
  const T = (en: string): string => (es ? (ES_COPY[en] ?? en) : en);
  const [form, setForm] = useState(rules);
  const itemState = reservationItemState(form.reservationOfferingId, offerings);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const set = <K extends keyof ServiceRules>(key: K, value: ServiceRules[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  const onSave = () => {
    startSaving(async () => {
      const result = await saveReservationRules({
        venueId,
        isActive: form.isActive,
        partySizeMin: form.partySizeMin,
        partySizeMax: form.partySizeMax,
        horizonDays: form.horizonDays,
        minNoticeMinutes: form.minNoticeMinutes,
        turnTimeBands: form.turnTimeBands,
        defaultTurnMinutes: form.defaultTurnMinutes,
        allowPublicUpsize: form.allowPublicUpsize,
        cardOnFileFromParty: form.cardOnFileFromParty,
        noShowFeeCents: form.noShowFeeCents,
        noShowFeeBasis: form.noShowFeeBasis,
        noShowGraceMinutes: form.noShowGraceMinutes,
        depositFromParty: form.depositFromParty,
        depositCentsPerPerson: form.depositCentsPerPerson,
        freeCancelHours: form.freeCancelHours,
        reservationOfferingId: form.reservationOfferingId,
        waitlistEnabled: form.waitlistEnabled,
        walkinsEnabled: form.walkinsEnabled,
        notesEnabled: form.notesEnabled,
      });
      setMessage(
        result.ok
          ? { tone: "ok", text: es ? "Guardado." : "Saved." }
          : { tone: "error", text: result.error },
      );
    });
  };

  return (
    <div>
      <Section title={es ? "Artículo de reservas" : "Reservation item"}>
        <Row
          label={es ? "Se vende como" : "Sold as"}
          hint={
            itemState === "ready"
              ? es
                ? "Cada reserva se registra como una venta de este artículo."
                : "Every reservation is recorded as a sale of this item."
              : itemState === "unset"
                ? es
                  ? "Elige el artículo con el que se toman las reservas. Sin él, nadie puede reservar."
                  : "Pick the item reservations are taken as. Without it nobody can book."
                : es
                  ? "Publica el artículo de reservas para aceptar reservas."
                  : "Publish the reservation item to accept reservations."
          }
        >
          <select
            value={form.reservationOfferingId ?? ""}
            onChange={(e) => set("reservationOfferingId", e.target.value || null)}
            aria-label={es ? "Artículo de reservas" : "Reservation item"}
            data-testid="reservation-item-select"
            style={{ ...numberStyle, width: 220 }}
          >
            <option value="">{es ? "Sin elegir" : "Not set"}</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title || o.id}
                {o.status === "published" ? "" : es ? " (sin publicar)" : " (not published)"}
              </option>
            ))}
          </select>
        </Row>
        {itemState === "unpublished" || itemState === "unset" || itemState === "missing" ? (
          <div role="status" data-testid="reservation-item-prompt" style={{ color: C.danger, fontSize: 12.5, padding: "8px 0 4px" }}>
            {itemState === "unset"
              ? es ? "Falta elegir el artículo de reservas." : "No reservation item is set."
              : es ? "Publica el artículo de reservas para aceptar reservas." : "Publish the reservation item to accept reservations."}
          </div>
        ) : null}
      </Section>
      <Section title={T("Taking reservations")}>
        <Row
          label={T("Reservations are on")}
          hint={
            canGoLive
              ? "Guests can book from your site once a service window exists."
              : "You can switch this on, but nothing is bookable until this venue has tables."
          }
        >
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            aria-label={T("Reservations are on")}
          />
        </Row>
        <Row label={T("Party size")} hint={T("Larger parties are sent to the chat instead.")}>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.partySizeMin}
            onChange={(e) => set("partySizeMin", Number(e.target.value))}
            style={numberStyle}
            aria-label={T("Smallest party")}
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "a" : "to"}</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.partySizeMax}
            onChange={(e) => set("partySizeMax", Number(e.target.value))}
            style={numberStyle}
            aria-label={T("Largest party")}
          />
        </Row>
        <Row label={T("Book ahead")} hint={T("How far in advance a guest may book.")}>
          <input
            type="number"
            min={1}
            max={365}
            value={form.horizonDays}
            onChange={(e) => set("horizonDays", Number(e.target.value))}
            style={numberStyle}
            aria-label={T("Days ahead")}
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "días" : "days"}</span>
        </Row>
        <Row label={T("Minimum notice")} hint={T("How close to the time a guest may still book.")}>
          <input
            type="number"
            min={0}
            max={10080}
            value={form.minNoticeMinutes}
            onChange={(e) => set("minNoticeMinutes", Number(e.target.value))}
            style={numberStyle}
            aria-label={T("Minutes of notice")}
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "minutos" : "minutes"}</span>
        </Row>
        <Row
          label={T("Walk-ins")}
          hint={T("The host stand seats walk-ins against the same tables, so the book cannot oversell them.")}
        >
          <input
            type="checkbox"
            checked={form.walkinsEnabled}
            onChange={(e) => set("walkinsEnabled", e.target.checked)}
            aria-label={T("Walk-ins")}
          />
        </Row>
        <Row label={T("Special requests")} hint={T("A note field on the reserve step.")}>
          <input
            type="checkbox"
            checked={form.notesEnabled}
            onChange={(e) => set("notesEnabled", e.target.checked)}
            aria-label={T("Special requests")}
          />
        </Row>
      </Section>

      <Section title={T("No-shows and deposits")}>
        <Row
          label={T("Card on file from")}
          hint={T("A card holds the table. Nothing is charged unless the party does not arrive.")}
        >
          <input
            type="checkbox"
            checked={form.cardOnFileFromParty !== null}
            onChange={(e) => set("cardOnFileFromParty", e.target.checked ? 6 : null)}
            aria-label={T("Ask for a card on file")}
          />
          {form.cardOnFileFromParty !== null ? (
            <input
              type="number"
              min={1}
              max={1000}
              value={form.cardOnFileFromParty}
              onChange={(e) => set("cardOnFileFromParty", Number(e.target.value))}
              style={numberStyle}
              aria-label={T("Card on file from this party size")}
            />
          ) : (
            <span style={{ color: C.inkDim, fontSize: 13 }}>{es ? "nunca" : "never"}</span>
          )}
        </Row>
        <Row
          label={T("No-show fee")}
          hint={T("Charged after the grace period if the party has not been seated.")}
        >
          <input
            type="number"
            min={0}
            step={1}
            value={Math.round(form.noShowFeeCents / 100)}
            onChange={(e) => set("noShowFeeCents", Math.round(Number(e.target.value) * 100))}
            style={numberStyle}
            aria-label={T("No-show fee in dollars")}
          />
          <select
            value={form.noShowFeeBasis}
            onChange={(e) =>
              set("noShowFeeBasis", e.target.value === "per_party" ? "per_party" : "per_person")
            }
            style={{ ...numberStyle, width: "auto" }}
            aria-label={T("No-show fee basis")}
          >
            <option value="per_person">{es ? "por persona" : "per person"}</option>
            <option value="per_party">{es ? "por grupo" : "per party"}</option>
          </select>
        </Row>
        <Row label={T("Grace period")} hint={T("How long a table is held before the fee applies.")}>
          <input
            type="number"
            min={0}
            max={240}
            value={form.noShowGraceMinutes}
            onChange={(e) => set("noShowGraceMinutes", Number(e.target.value))}
            style={numberStyle}
            aria-label={T("Grace minutes")}
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "minutos" : "minutes"}</span>
        </Row>
        <Row label={T("Deposit from")} hint={T("Taken at booking and applied to the bill.")}>
          <input
            type="checkbox"
            checked={form.depositFromParty !== null}
            onChange={(e) => set("depositFromParty", e.target.checked ? 8 : null)}
            aria-label={T("Take a deposit")}
          />
          {form.depositFromParty !== null ? (
            <>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.depositFromParty}
                onChange={(e) => set("depositFromParty", Number(e.target.value))}
                style={numberStyle}
                aria-label={T("Deposit from this party size")}
              />
              <input
                type="number"
                min={0}
                value={Math.round(form.depositCentsPerPerson / 100)}
                onChange={(e) =>
                  set("depositCentsPerPerson", Math.round(Number(e.target.value) * 100))
                }
                style={numberStyle}
                aria-label={T("Deposit per person in dollars")}
              />
              <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "por persona" : "per person"}</span>
            </>
          ) : (
            <span style={{ color: C.inkDim, fontSize: 13 }}>{es ? "nunca" : "never"}</span>
          )}
        </Row>
        <Row label={T("Free cancellation until")} hint={T("After this, a deposit is not returned.")}>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.freeCancelHours}
            onChange={(e) => set("freeCancelHours", Number(e.target.value))}
            style={numberStyle}
            aria-label={T("Free cancellation hours")}
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "horas antes" : "hours before"}</span>
        </Row>
      </Section>

      <Section title={T("Service windows")}>
        {windows.length === 0 ? (
          <p style={{ fontSize: 13.5, color: C.inkMuted, lineHeight: 1.6, margin: "10px 0 14px" }}>
            {es
              ? `Aún no hay horarios de servicio. Un horario es cuando sientas gente, en ${timezone}: comida de 13:00 a 16:00, cena de 19:00 a 23:00. Un horario puede pasar de medianoche.`
              : `No service windows yet. A window is when you seat people, in ${timezone}: lunch 13:00 to 16:00, dinner 19:00 to 23:00. A window may run past midnight.`}
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 12px" }}>
            {windows.map((w) => (
              <li
                key={w.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  fontSize: 14,
                }}
              >
                <span style={{ color: C.ink, fontWeight: 500 }}>{w.key}</span>
                <span style={{ color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                  {hhmm(w.localTimeMin)} {es ? "por" : "for"} {Math.round((w.durationMinutes / 60) * 10) / 10}h &middot;{" "}
                  {w.weekdays.map((d) => (es ? DAYS_ES : DAYS)[d - 1]).join(" ")}
                  {w.isActive ? "" : es ? " · cerrado" : " · closed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        style={{
          background: "none",
          border: "none",
          color: C.accent,
          fontSize: 13.5,
          fontWeight: 600,
          padding: "4px 0",
          marginBottom: 12,
          cursor: "pointer",
        }}
        aria-expanded={advanced}
      >
        {advanced ? (es ? "Ocultar avanzado" : "Hide advanced") : es ? "Avanzado: tiempos de turno y mesas más grandes" : "Advanced: turn times and upsizing"}
      </button>

      {advanced ? (
        <Section title={T("Advanced")}>
          <Row
            label={T("How long a table turns")}
            hint={T("Used when no band below covers the party. A 90 minute turn makes 20:00 and 21:30 independent.")}
          >
            <input
              type="number"
              min={15}
              max={720}
              value={form.defaultTurnMinutes}
              onChange={(e) => set("defaultTurnMinutes", Number(e.target.value))}
              style={numberStyle}
              aria-label={T("Default turn minutes")}
            />
            <span style={{ color: C.inkMuted, fontSize: 13 }}>{es ? "minutos" : "minutes"}</span>
          </Row>
          <Row
            label={T("Offer a bigger table online")}
            hint={T("A party of two booking a four-top when the two-tops are gone. Your host can always do this at the door; this is about the website.")}
          >
            <input
              type="checkbox"
              checked={form.allowPublicUpsize}
              onChange={(e) => set("allowPublicUpsize", e.target.checked)}
              aria-label={T("Offer a bigger table online")}
            />
          </Row>
          <Row label={T("Waitlist")} hint={T("Offer released tables. Needs SMS, which is not connected yet.")}>
            <input
              type="checkbox"
              checked={form.waitlistEnabled}
              onChange={(e) => set("waitlistEnabled", e.target.checked)}
              aria-label={T("Waitlist")}
            />
          </Row>
        </Section>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (es ? "Guardando" : "Saving") : es ? "Guardar" : "Save"}
        </button>
        {message ? (
          <span
            role="status"
            style={{ fontSize: 13.5, color: message.tone === "ok" ? C.ok : C.danger }}
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
