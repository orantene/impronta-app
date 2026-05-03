// Phase 3 — canonical workspace Bookings page.
// Server Component — no "use client".
//
// Shows confirmed bookings (status = 'booked' | 'converted') for the tenant.
// Ordered by event_date ascending so the next upcoming job is first.
// Capability gate: view_dashboard (viewer+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceBookings } from "../../_data-bridge";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUpcoming(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) >= new Date();
}

// ─── Booking row ──────────────────────────────────────────────────────────────

type BookingRow = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
};

function BookingListItem({
  booking,
  muted,
  tenantSlug,
}: {
  booking: BookingRow;
  muted: boolean;
  tenantSlug: string;
}) {
  const month = booking.event_date
    ? new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(booking.event_date))
    : null;
  const day = booking.event_date ? new Date(booking.event_date).getDate() : null;

  return (
    <Link
      href={`/${tenantSlug}/admin/work/${booking.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        textDecoration: "none",
        opacity: muted ? 0.65 : 1,
        fontFamily: FONT,
      }}
    >
      {/* Date badge */}
      <div
        style={{
          flexShrink: 0,
          width: 44,
          textAlign: "center",
        }}
      >
        {month && day ? (
          <>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: C.inkDim,
                lineHeight: 1,
                marginBottom: 2,
              }}
            >
              {month}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: C.ink,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {day}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 11, color: C.inkDim }}>TBD</span>
        )}
      </div>

      {/* Name + location */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {booking.contact_name}
        </div>
        {(booking.company || booking.event_location) && (
          <div
            style={{
              fontSize: 12,
              color: C.inkMuted,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {[booking.company, booking.event_location].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Talent count */}
      {booking.quantity != null && booking.quantity > 0 && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 12,
            color: C.inkMuted,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {booking.quantity} {booking.quantity === 1 ? "talent" : "talents"}
        </span>
      )}

      {/* Confirmed badge */}
      <span
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 8px",
          borderRadius: 999,
          background: C.greenSoft,
          color: C.green,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.1,
        }}
      >
        Confirmed
      </span>
    </Link>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase" as const,
        color: C.inkDim,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceBookingsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("view_dashboard", scope.tenantId);
  if (!canView) notFound();

  const bookings = await loadWorkspaceBookings(scope.tenantId);

  const upcoming = bookings.filter((b) => isUpcoming(b.event_date));
  const past = bookings.filter((b) => !isUpcoming(b.event_date));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>

      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: 4,
            }}
          >
            {scope.membership.display_name}
          </div>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.5,
              lineHeight: 1.1,
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            Bookings
            <span
              style={{
                fontSize: 16,
                fontWeight: 400,
                color: C.inkDim,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {bookings.length}
            </span>
          </h1>
        </div>

        <Link
          href={`/${tenantSlug}/admin/work`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 34,
            padding: "0 14px",
            borderRadius: 8,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            color: C.ink,
            fontFamily: FONT,
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: -0.1,
          }}
        >
          Full pipeline →
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div
          style={{
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden>📋</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            No confirmed bookings yet
          </p>
          <p style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
            Bookings appear here once an inquiry is confirmed.
          </p>
        </div>
      ) : (
        <>
          {/* ── Upcoming ── */}
          {upcoming.length > 0 && (
            <section>
              <SectionHead>
                Upcoming
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10.5,
                    fontWeight: 500,
                    letterSpacing: 0,
                    textTransform: "none",
                  }}
                >
                  {upcoming.length}
                </span>
              </SectionHead>
              <div
                style={{
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {upcoming.map((b, i) => (
                  <div key={b.id}>
                    {i > 0 && (
                      <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />
                    )}
                    <BookingListItem booking={b} muted={false} tenantSlug={tenantSlug} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Past ── */}
          {past.length > 0 && (
            <section>
              <SectionHead>
                Past
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10.5,
                    fontWeight: 500,
                    letterSpacing: 0,
                    textTransform: "none",
                  }}
                >
                  {past.length}
                </span>
              </SectionHead>
              <div
                style={{
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {past.map((b, i) => (
                  <div key={b.id}>
                    {i > 0 && (
                      <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />
                    )}
                    <BookingListItem booking={b} muted tenantSlug={tenantSlug} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
