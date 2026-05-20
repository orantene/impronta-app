// Phase 3.10 — Client Bookings page.
// Confirmed bookings (status = booked/converted) for this client.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadClientBookings,
  loadWorkspaceRosterLite,
  type ClientBookingRow,
} from "../../_data-bridge";
import {
  formatClientWeekdayDate,
  getClientDateParts,
  isPastClientDate,
} from "../date-format";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { NewInquiryButton } from "../_components/NewInquiryButton";
import { EmptyState } from "../_components/EmptyState";

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
  return formatClientWeekdayDate(iso, "TBC");
}

function isPast(iso: string | null): boolean {
  return isPastClientDate(iso);
}

function BookingRow({
  booking,
  idx,
  total,
  tenantSlug,
}: {
  booking: ClientBookingRow;
  idx: number;
  total: number;
  tenantSlug: string;
}) {
  const future = !isPast(booking.event_date);
  const dateParts = getClientDateParts(booking.event_date);
  return (
    <Link
      href={`/${tenantSlug}/client/inquiries/${booking.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "48px 1fr auto",
        gap: 16,
        alignItems: "center",
        padding: "16px 18px",
        borderBottom: idx < total - 1 ? `1px solid ${C.borderSoft}` : "none",
        fontFamily: FONT,
        textDecoration: "none",
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
        {dateParts ? (
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
              {dateParts.day}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: future ? C.greenDeep : C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {dateParts.monthShort}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: C.inkDim, textAlign: "center" }}>TBC</div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0">
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
    </Link>
  );
}

function BookingSection({ rows, label, tenantSlug }: { rows: ClientBookingRow[]; label: string; tenantSlug: string }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.inkMuted, marginBottom: 10, fontFamily: FONT }}>
        {label} ({rows.length})
      </div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
        {rows.map((b, i) => (
          <BookingRow key={b.id} booking={b} idx={i} total={rows.length} tenantSlug={tenantSlug} />
        ))}
      </div>
    </section>
  );
}

export default async function ClientBookingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [bookings, roster] = await Promise.all([
    loadClientBookings(session.user.id, scope.tenantId),
    loadWorkspaceRosterLite(scope.tenantId),
  ]);

  const upcoming = bookings.filter((b) => !isPast(b.event_date));
  const past     = bookings.filter((b) => isPast(b.event_date) || !b.event_date);

  const clientForBtn = {
    displayName: clientProfile.displayName,
    company: clientProfile.company,
    agencyName: clientProfile.agencyName,
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Bookings"
        title="Your bookings"
        subtitle={
          bookings.length === 0
            ? "Confirmed bookings will appear here once your offers are accepted."
            : `${bookings.length} confirmed · ${upcoming.length} upcoming`
        }
        badge={upcoming.length > 0 ? <HeaderBadge tone="success">{upcoming.length} upcoming</HeaderBadge> : undefined}
        actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} />}
      />

      {bookings.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No bookings yet"
          body="Once your inquiries are confirmed, they'll appear here as bookings."
          actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} label="Start inquiry" />}
        />
      ) : (
        <div className="flex flex-col gap-7">
          <BookingSection rows={upcoming} label="Upcoming" tenantSlug={tenantSlug} />
          <BookingSection rows={past}     label="Past" tenantSlug={tenantSlug} />
        </div>
      )}
    </div>
  );
}
