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

import { useCallback, useEffect, useState } from "react";
import type { ReserveAvailability, ReserveSlot } from "@/app/(public)/_reserve/reserve-actions";

type Props = {
  tenantId: string;
  venueName: string;
  /** The tenant's word for this: reservation, appointment, booking, agenda. */
  ctaVerb?: string;
  partyMin?: number;
  partyMax?: number;
  /** Rendered above the button when the venue asks for a card. */
  cardNotice?: string | null;
  onAskFirst?: () => void;
};

const REFUSAL_COPY: Record<string, string> = {
  reservations_off: "This restaurant is not taking bookings online right now.",
  closed: "We are closed that day.",
  party_below_minimum: "That party is smaller than we take online.",
  party_above_maximum: "For a party that size, message us and we will sort it out.",
  no_band_fits_this_party: "We have no table that size. Message us and we will see what we can do.",
  beyond_booking_horizon: "That is further ahead than we take bookings.",
  inside_minimum_notice: "Too late to book that online. Message us and we will see what we can do.",
  fully_booked: "Fully booked that day. Try another date, or message us.",
  unavailable: "We could not load the times just now. Try again in a moment.",
};

function ymdInZone(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(d: Date, index: number): string {
  if (index === 0) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
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
  onAskFirst,
}: Props) {
  const today = new Date();
  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const [party, setParty] = useState(Math.min(2, partyMax));
  const [dateIndex, setDateIndex] = useState(0);
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<ReserveSlot | null>(null);
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; data: ReserveAvailability }
  >({ status: "loading" });

  const onDate = ymdInZone(dates[dateIndex]!);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setSlot(null);
    try {
      const { loadReserveAvailability } = await import(
        "@/app/(public)/_reserve/reserve-actions"
      );
      const data = await loadReserveAvailability({ tenantId, partySize: party, onDate });
      setState({ status: "ready", data });
      if (data.ok) setWindowKey((k) => (data.windows.some((w) => w.key === k) ? k : data.windows[0]?.key ?? null));
    } catch {
      setState({ status: "ready", data: { ok: false, reason: "unavailable" } });
    }
  }, [tenantId, party, onDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = state.status === "ready" && state.data.ok ? state.data : null;
  const shown = available?.windows.find((w) => w.key === windowKey) ?? available?.windows[0];

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
        {ctaVerb} a table
      </h2>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, color: C.muted }}>Party of</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => setParty((p) => Math.max(partyMin, p - 1))}
            style={{ ...chip(false), width: 36 }}
            aria-label="Fewer people"
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
            aria-label="More people"
          >
            +
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 14 }}>
        {dates.map((d, i) => (
          <button
            key={i}
            type="button"
            style={chip(i === dateIndex)}
            onClick={() => setDateIndex(i)}
            aria-pressed={i === dateIndex}
          >
            {dayLabel(d, i)}
          </button>
        ))}
      </div>

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
          <p style={{ fontSize: 13.5, color: C.dim, margin: 0 }}>Checking the book…</p>
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
                    <span style={{ fontSize: 10, color: "#8A6A00" }}>last table</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            {REFUSAL_COPY[state.data.ok ? "unavailable" : state.data.reason] ??
              REFUSAL_COPY.unavailable}
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

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={!slot}
          style={{
            flex: 1,
            background: slot ? C.accent : "rgba(11,11,13,0.08)",
            color: slot ? "#fff" : C.dim,
            border: "none",
            borderRadius: 9,
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 600,
            cursor: slot ? "pointer" : "default",
          }}
        >
          {slot ? `${ctaVerb} at ${slot.label}` : `Pick a time`}
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
    </div>
  );
}
