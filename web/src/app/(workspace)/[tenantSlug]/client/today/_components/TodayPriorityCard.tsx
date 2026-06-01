"use client";

/**
 * TodayPriorityCard — high-prominence card surfacing today's event.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11
 * Plan: web/docs/client-execution-plan-2026-05-14.md §23 Phase F
 *
 * Renders ONLY when an UpcomingBooking has bucket="today". Shows the
 * title + venue + time + a primary "Open call sheet" CTA + a one-tap
 * "Contact coordinator" CTA (tel:). Click anywhere on the card opens
 * the call-sheet drawer.
 */

import { useState } from "react";
import type { UpcomingBooking } from "../../../_data-bridge/client-upcoming";
import { getClientDateParts } from "../../date-format";
import { CallSheetDrawer } from "./CallSheetDrawer";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(24,24,27,0.10)",
  card: "#FFFFFF",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.10)",
  successDeep: "#063A24",
} as const;

export function TodayPriorityCard({
  booking,
  tenantSlug,
}: {
  booking: UpcomingBooking;
  tenantSlug: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div
        style={{
          background: `linear-gradient(135deg, ${C.successSoft} 0%, ${C.card} 100%)`,
          border: `1px solid ${C.successSoft}`,
          borderLeft: `4px solid ${C.success}`,
          borderRadius: 14,
          padding: "18px 20px",
          fontFamily: FONT,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: C.success,
                textTransform: "uppercase",
                letterSpacing: 0.7,
              }}
            >
              Today
            </div>
            <h2
              style={{
                margin: "4px 0 0",
                fontSize: 22,
                fontWeight: 600,
                fontFamily: FONT_DISPLAY,
                color: C.ink,
                letterSpacing: -0.3,
                lineHeight: 1.2,
              }}
            >
              {booking.title}
            </h2>
            <div style={{ marginTop: 6, fontSize: 13, color: C.inkMuted, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {booking.start_time && <span>⏰ {booking.start_time}</span>}
              {(booking.venue_name || booking.city) && (
                <span>📍 {booking.venue_name ?? booking.city}</span>
              )}
              {booking.talent.length > 0 && (
                <span>
                  {booking.talent.filter((t) => t.status === "active").length}/{booking.talent.length} talent confirmed
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 9,
              background: C.success,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.1,
            }}
          >
            Open call sheet
          </button>
          {booking.coordinator?.phone && (
            <a
              href={`tel:${booking.coordinator.phone}`}
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 9,
                background: "#fff",
                color: C.ink,
                border: `1px solid ${C.border}`,
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              📞 Call {booking.coordinator.name?.split(" ")[0] ?? "coordinator"}
            </a>
          )}
          {booking.google_maps_url && (
            <a
              href={booking.google_maps_url}
              target="_blank"
              rel="noreferrer"
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 9,
                background: "#fff",
                color: C.ink,
                border: `1px solid ${C.border}`,
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              🗺️ Map
            </a>
          )}
        </div>
      </div>

      {drawerOpen && (
        <CallSheetDrawer
          booking={booking}
          tenantSlug={tenantSlug}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Inline upcoming-events tile rendered when there's no event today but
 * something is coming this week. Lower visual weight than the priority
 * card; same drawer.
 */
export function UpcomingEventsTile({
  bookings,
  tenantSlug,
}: {
  bookings: UpcomingBooking[];
  tenantSlug: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (bookings.length === 0) return null;
  return (
    <>
      <section
        style={{
          background: C.card,
          border: `1px solid rgba(24,24,27,0.06)`,
          borderRadius: 12,
          padding: "14px 16px",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.inkMuted,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 10,
          }}
        >
          Coming up
        </div>
        <div className="flex flex-col gap-2">
          {bookings.map((b, i) => {
            const dateParts = getClientDateParts(b.event_date);
            return (
              <button
                key={b.inquiry_id}
                type="button"
                onClick={() => setOpenIdx(i)}
                style={{
                  background: "transparent",
                  border: `1px solid rgba(24,24,27,0.06)`,
                  borderRadius: 9,
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontFamily: FONT,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: "rgba(15,81,50,0.06)",
                    color: C.successDeep,
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
                    {dateParts?.day ?? "--"}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {dateParts?.monthShort ?? "TBC"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                    {b.start_time ? `${b.start_time} · ` : ""}
                    {b.venue_name ?? b.city ?? "Location TBD"}
                  </div>
                </div>
                <span style={{ color: C.inkMuted, fontSize: 18 }}>›</span>
              </button>
            );
          })}
        </div>
      </section>
      {openIdx !== null && bookings[openIdx] && (
        <CallSheetDrawer
          booking={bookings[openIdx]}
          tenantSlug={tenantSlug}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </>
  );
}
