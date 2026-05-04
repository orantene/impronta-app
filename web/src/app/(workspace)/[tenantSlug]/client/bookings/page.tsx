// Phase 3.10 — Client Bookings page.
// Confirmed bookings (status = booked/converted) for this client.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientBookings } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  accent:      "#1D4ED8",
  greenDeep:   "#1A7348",
  greenSoft:   "rgba(26,115,72,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function fmtDate(iso: string | null): string {
  if (!iso) return "TBC";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "TBC";
  }
}

function isPast(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export default async function ClientBookingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const bookings = await loadClientBookings(session.user.id, scope.tenantId);

  const upcoming = bookings.filter((b) => !isPast(b.event_date));
  const past     = bookings.filter((b) => isPast(b.event_date) || !b.event_date);

  function BookingRow({ booking, idx, total }: { booking: typeof bookings[0]; idx: number; total: number }) {
    const future = !isPast(booking.event_date);
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "48px 1fr auto",
          gap: 16,
          alignItems: "center",
          padding: "16px 18px",
          borderBottom: idx < total - 1 ? `1px solid ${C.borderSoft}` : "none",
          fontFamily: FONT,
        }}
      >
        {/* Date box */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: future ? C.greenSoft : "rgba(11,11,13,0.04)",
            borderRadius: 8,
            padding: "6px 4px",
          }}
        >
          {booking.event_date ? (
            <>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: future ? C.greenDeep : C.inkMuted,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {new Date(booking.event_date).getDate()}
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: future ? C.greenDeep : C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {new Date(booking.event_date).toLocaleDateString("en-GB", { month: "short" })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.inkDim, textAlign: "center" }}>TBC</div>
          )}
        </div>

        {/* Details */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {booking.company ?? "Confirmed booking"}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            {booking.event_date && (
              <span style={{ fontSize: 12, color: C.inkMuted }}>{fmtDate(booking.event_date)}</span>
            )}
            {booking.event_location && (
              <span style={{ fontSize: 12, color: C.inkMuted }}>· {booking.event_location}</span>
            )}
            {booking.quantity && (
              <span style={{ fontSize: 12, color: C.inkMuted }}>· {booking.quantity} talent</span>
            )}
          </div>
        </div>

        {/* Status */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "3px 10px",
            borderRadius: 999,
            background: future ? C.greenSoft : "rgba(11,11,13,0.04)",
            color: future ? C.greenDeep : C.inkMuted,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase" as const,
            fontFamily: FONT,
            whiteSpace: "nowrap",
          }}
        >
          {future ? "Confirmed" : "Past"}
        </div>
      </div>
    );
  }

  function BookingSection({ rows, label }: { rows: typeof bookings; label: string }) {
    if (rows.length === 0) return null;
    return (
      <section>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.inkMuted, marginBottom: 10, fontFamily: FONT }}>
          {label} ({rows.length})
        </div>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
          {rows.map((b, i) => (
            <BookingRow key={b.id} booking={b} idx={i} total={rows.length} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          Your bookings
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "6px 0 0" }}>
          {bookings.length === 0
            ? "No confirmed bookings yet."
            : `${bookings.length} confirmed · ${upcoming.length} upcoming`}
        </p>
      </div>

      {bookings.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No bookings yet
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
            Once your inquiries are confirmed, they&apos;ll appear here as bookings.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <BookingSection rows={upcoming} label="Upcoming" />
          <BookingSection rows={past}     label="Past" />
        </div>
      )}
    </div>
  );
}
