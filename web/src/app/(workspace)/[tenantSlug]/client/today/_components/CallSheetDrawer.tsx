"use client";

/**
 * CallSheetDrawer — day-of trust moment.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11 + §12
 * Plan: web/docs/client-execution-plan-2026-05-14.md §23 Phase F
 *
 * Opens from the Today priority card or from a booking row. Surfaces:
 *   - Coordinator name + phone (tap-to-call on mobile)
 *   - Talent list with confirmed status
 *   - Venue + Google Maps tap-to-open
 *   - Timeline (start time + duration + notes)
 *   - Quick link to Messages thread
 *
 * Client does NOT see: internal admin notes, talent private payout,
 * coordinator commission. Loader already filters these.
 */

import { useEffect } from "react";
import Link from "next/link";
import type { UpcomingBooking } from "../../../_data-bridge/client-upcoming";
import { formatClientWeekdayDate } from "../../date-format";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface: "#FAFAF7",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.10)",
} as const;

export function CallSheetDrawer({
  booking,
  tenantSlug,
  onClose,
}: {
  booking: UpcomingBooking;
  tenantSlug: string;
  onClose: () => void;
}) {
  // Body-scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eventDate = formatDate(booking.event_date);
  const isToday = booking.bucket === "today";
  const confirmedCount = booking.talent.filter((t) => t.status === "active").length;
  const totalCount = booking.talent.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Call sheet"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(11,11,13,0.45)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100vw)",
          height: "100dvh",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
          fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.success : C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {isToday ? "Today" : "Call sheet"}
            </div>
            <h2 style={{ margin: "3px 0 0", fontSize: 20, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY, letterSpacing: -0.2 }}>
              {booking.title}
            </h2>
            <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 4 }}>
              {eventDate}
              {booking.start_time && <> · {booking.start_time}</>}
              {booking.duration && <> · {booking.duration}</>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent",
              color: C.ink,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Coordinator on-call */}
          <Section title="Coordinator on call">
            {booking.coordinator?.name ? (
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: C.accentSoft,
                    color: C.accent,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {initials(booking.coordinator.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{booking.coordinator.name}</div>
                  {booking.coordinator.phone ? (
                    <a
                      href={`tel:${booking.coordinator.phone}`}
                      style={{ fontSize: 13, color: C.accent, fontWeight: 500, textDecoration: "none" }}
                    >
                      📞 {booking.coordinator.phone}
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: C.inkDim }}>No phone on file</span>
                  )}
                </div>
              </div>
            ) : (
              <EmptyPrompt label="No coordinator assigned yet" />
            )}
          </Section>

          {/* Talent */}
          <Section title={`Talent (${confirmedCount}/${totalCount} confirmed)`}>
            {booking.talent.length === 0 ? (
              <EmptyPrompt label="No talent confirmed yet" />
            ) : (
              <div className="flex flex-col gap-2">
                {booking.talent.map((t) => (
                  <div
                    key={t.participant_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#fff",
                      border: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "rgba(11,11,13,0.05)",
                        color: C.inkMuted,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {initials(t.name)}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: C.ink, fontWeight: 500 }}>{t.name}</div>
                    <StatusPill status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Venue */}
          <Section title="Venue">
            {booking.venue_name || booking.city ? (
              <>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>
                  {booking.venue_name ?? booking.city}
                </div>
                {booking.venue_name && booking.city && (
                  <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 2 }}>{booking.city}</div>
                )}
                {booking.google_maps_url && (
                  <a
                    href={booking.google_maps_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      marginTop: 10,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: C.accentSoft,
                      color: C.accent,
                      textDecoration: "none",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    🗺️ Open in Google Maps
                  </a>
                )}
              </>
            ) : (
              <EmptyPrompt label="Venue not set" />
            )}
          </Section>

          {/* Logistics notes */}
          {booking.notes && (
            <Section title="Logistics">
              <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {booking.notes}
              </p>
            </Section>
          )}

          {/* Footer link */}
          <Link
            href={`/${tenantSlug}/client/messages?inquiry=${encodeURIComponent(booking.inquiry_id)}&tab=chat`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 9,
              background: "#fff",
              border: `1px solid ${C.border}`,
              color: C.ink,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            Open thread →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyPrompt({ label }: { label: string }) {
  return <div style={{ fontSize: 12.5, color: C.inkDim, fontStyle: "italic" }}>{label}</div>;
}

function StatusPill({ status }: { status: string }) {
  const palette = (() => {
    if (status === "active") return { bg: C.successSoft, fg: C.success, label: "Confirmed" };
    if (status === "invited") return { bg: C.accentSoft, fg: C.accent, label: "Invited" };
    if (status === "declined") return { bg: "rgba(239,68,68,0.08)", fg: "#991B1B", label: "Declined" };
    return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: status };
  })();
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {palette.label}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(iso: string): string {
  return formatClientWeekdayDate(iso, iso);
}
