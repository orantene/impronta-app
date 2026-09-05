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
import { saveReservationRules } from "@/lib/server-actions/admin-reservation-rules";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
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

export function ReservationSettingsForm({
  venueId,
  timezone,
  rules,
  windows,
  canGoLive,
}: {
  venueId: string;
  timezone: string;
  rules: ServiceRules;
  windows: ServiceWindow[];
  canGoLive: boolean;
}) {
  const [form, setForm] = useState(rules);
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
        waitlistEnabled: form.waitlistEnabled,
        walkinsEnabled: form.walkinsEnabled,
        notesEnabled: form.notesEnabled,
      });
      setMessage(
        result.ok
          ? { tone: "ok", text: "Saved." }
          : { tone: "error", text: result.error },
      );
    });
  };

  return (
    <div>
      <Section title="Taking reservations">
        <Row
          label="Reservations are on"
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
            aria-label="Reservations are on"
          />
        </Row>
        <Row label="Party size" hint="Larger parties are sent to the chat instead.">
          <input
            type="number"
            min={1}
            max={1000}
            value={form.partySizeMin}
            onChange={(e) => set("partySizeMin", Number(e.target.value))}
            style={numberStyle}
            aria-label="Smallest party"
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>to</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.partySizeMax}
            onChange={(e) => set("partySizeMax", Number(e.target.value))}
            style={numberStyle}
            aria-label="Largest party"
          />
        </Row>
        <Row label="Book ahead" hint="How far in advance a guest may book.">
          <input
            type="number"
            min={1}
            max={365}
            value={form.horizonDays}
            onChange={(e) => set("horizonDays", Number(e.target.value))}
            style={numberStyle}
            aria-label="Days ahead"
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>days</span>
        </Row>
        <Row label="Minimum notice" hint="How close to the time a guest may still book.">
          <input
            type="number"
            min={0}
            max={10080}
            value={form.minNoticeMinutes}
            onChange={(e) => set("minNoticeMinutes", Number(e.target.value))}
            style={numberStyle}
            aria-label="Minutes of notice"
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>minutes</span>
        </Row>
        <Row
          label="Walk-ins"
          hint="The host stand seats walk-ins against the same tables, so the book cannot oversell them."
        >
          <input
            type="checkbox"
            checked={form.walkinsEnabled}
            onChange={(e) => set("walkinsEnabled", e.target.checked)}
            aria-label="Walk-ins"
          />
        </Row>
        <Row label="Special requests" hint="A note field on the reserve step.">
          <input
            type="checkbox"
            checked={form.notesEnabled}
            onChange={(e) => set("notesEnabled", e.target.checked)}
            aria-label="Special requests"
          />
        </Row>
      </Section>

      <Section title="No-shows and deposits">
        <Row
          label="Card on file from"
          hint="A card holds the table. Nothing is charged unless the party does not arrive."
        >
          <input
            type="checkbox"
            checked={form.cardOnFileFromParty !== null}
            onChange={(e) => set("cardOnFileFromParty", e.target.checked ? 6 : null)}
            aria-label="Ask for a card on file"
          />
          {form.cardOnFileFromParty !== null ? (
            <input
              type="number"
              min={1}
              max={1000}
              value={form.cardOnFileFromParty}
              onChange={(e) => set("cardOnFileFromParty", Number(e.target.value))}
              style={numberStyle}
              aria-label="Card on file from this party size"
            />
          ) : (
            <span style={{ color: C.inkDim, fontSize: 13 }}>never</span>
          )}
        </Row>
        <Row
          label="No-show fee"
          hint="Charged after the grace period if the party has not been seated."
        >
          <input
            type="number"
            min={0}
            step={1}
            value={Math.round(form.noShowFeeCents / 100)}
            onChange={(e) => set("noShowFeeCents", Math.round(Number(e.target.value) * 100))}
            style={numberStyle}
            aria-label="No-show fee in dollars"
          />
          <select
            value={form.noShowFeeBasis}
            onChange={(e) =>
              set("noShowFeeBasis", e.target.value === "per_party" ? "per_party" : "per_person")
            }
            style={{ ...numberStyle, width: "auto" }}
            aria-label="No-show fee basis"
          >
            <option value="per_person">per person</option>
            <option value="per_party">per party</option>
          </select>
        </Row>
        <Row label="Grace period" hint="How long a table is held before the fee applies.">
          <input
            type="number"
            min={0}
            max={240}
            value={form.noShowGraceMinutes}
            onChange={(e) => set("noShowGraceMinutes", Number(e.target.value))}
            style={numberStyle}
            aria-label="Grace minutes"
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>minutes</span>
        </Row>
        <Row label="Deposit from" hint="Taken at booking and applied to the bill.">
          <input
            type="checkbox"
            checked={form.depositFromParty !== null}
            onChange={(e) => set("depositFromParty", e.target.checked ? 8 : null)}
            aria-label="Take a deposit"
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
                aria-label="Deposit from this party size"
              />
              <input
                type="number"
                min={0}
                value={Math.round(form.depositCentsPerPerson / 100)}
                onChange={(e) =>
                  set("depositCentsPerPerson", Math.round(Number(e.target.value) * 100))
                }
                style={numberStyle}
                aria-label="Deposit per person in dollars"
              />
              <span style={{ color: C.inkMuted, fontSize: 13 }}>per person</span>
            </>
          ) : (
            <span style={{ color: C.inkDim, fontSize: 13 }}>never</span>
          )}
        </Row>
        <Row label="Free cancellation until" hint="After this, a deposit is not returned.">
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.freeCancelHours}
            onChange={(e) => set("freeCancelHours", Number(e.target.value))}
            style={numberStyle}
            aria-label="Free cancellation hours"
          />
          <span style={{ color: C.inkMuted, fontSize: 13 }}>hours before</span>
        </Row>
      </Section>

      <Section title="Service windows">
        {windows.length === 0 ? (
          <p style={{ fontSize: 13.5, color: C.inkMuted, lineHeight: 1.6, margin: "10px 0 14px" }}>
            No service windows yet. A window is when you seat people, in {timezone} &mdash; lunch 13:00
            to 16:00, dinner 19:00 to 23:00. A window may run past midnight.
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
                  {hhmm(w.localTimeMin)} for {Math.round((w.durationMinutes / 60) * 10) / 10}h &middot;{" "}
                  {w.weekdays.map((d) => DAYS[d - 1]).join(" ")}
                  {w.isActive ? "" : " · closed"}
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
        {advanced ? "Hide advanced" : "Advanced: turn times and upsizing"}
      </button>

      {advanced ? (
        <Section title="Advanced">
          <Row
            label="How long a table turns"
            hint="Used when no band below covers the party. A 90 minute turn makes 20:00 and 21:30 independent."
          >
            <input
              type="number"
              min={15}
              max={720}
              value={form.defaultTurnMinutes}
              onChange={(e) => set("defaultTurnMinutes", Number(e.target.value))}
              style={numberStyle}
              aria-label="Default turn minutes"
            />
            <span style={{ color: C.inkMuted, fontSize: 13 }}>minutes</span>
          </Row>
          <Row
            label="Offer a bigger table online"
            hint="A party of two booking a four-top when the two-tops are gone. Your host can always do this at the door; this is about the website."
          >
            <input
              type="checkbox"
              checked={form.allowPublicUpsize}
              onChange={(e) => set("allowPublicUpsize", e.target.checked)}
              aria-label="Offer a bigger table online"
            />
          </Row>
          <Row label="Waitlist" hint="Offer released tables. Needs SMS, which is not connected yet.">
            <input
              type="checkbox"
              checked={form.waitlistEnabled}
              onChange={(e) => set("waitlistEnabled", e.target.checked)}
              aria-label="Waitlist"
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
          {saving ? "Saving" : "Save"}
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
