// Workspace Settings → Reservations.
//
// The rules every table booking follows. One page, preset first: a barber must
// never need to open it, so every field has a working default and the Set up
// drawer writes the same values.
//
// WHAT IS DELIBERATELY NOT ON THIS PAGE
//   Overbooking      capacity_pools.overbook_units — storing it twice would
//                    give two answers to one question.
//   Tables + bands   the Spaces & Seating editor. A group with no floor plan
//                    is enough to start, and defining tables here is how a
//                    platform ends with three floor plans for one room.
//   Availability     capacity_remaining_public, read directly at request time.
//
// Lives under the existing `settings` segment rather than claiming a rail slot:
// WORKSPACE_PAGE_SEGMENTS has no `reservations` entry, and adding one is the
// Dashboards Director's file, not mine.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { loadDefaultVenue } from "@/lib/spaces/venues";
import { loadVenueServiceConfig } from "@/lib/reservations/store";
import { ReservationSettingsForm } from "./ReservationSettingsForm";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.07)",
} as const;

export default async function ReservationSettingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const venue = await loadDefaultVenue(scope.tenantId);

  // A workspace with no venue cannot have service windows, because a window
  // points at a venue and resolves in that venue's clock. Saying so is more
  // useful than an empty form that silently saves nothing.
  if (!venue) {
    return (
      <main style={{ padding: 24, maxWidth: 720, fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px", color: C.ink }}>Reservations</h1>
        <p style={{ color: C.inkMuted, margin: "0 0 16px", lineHeight: 1.6 }}>
          Reservations need a venue first. A service window belongs to a place and runs on that
          place&rsquo;s clock, so there is nothing to set up until one exists.
        </p>
        <Link
          href={`/${tenantSlug}/admin/settings`}
          style={{ color: C.accent, fontWeight: 600, fontSize: 14 }}
        >
          Add a venue in Settings
        </Link>
      </main>
    );
  }

  const config = await loadVenueServiceConfig(scope.tenantId, venue.id);

  // A null config is a read failure, not an empty venue: an empty venue returns
  // defaults with isActive false. Rendering a form over a failed read would let
  // someone "save" a page of defaults over rules they cannot currently see.
  if (!config) {
    return (
      <main style={{ padding: 24, maxWidth: 720, fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px", color: C.ink }}>Reservations</h1>
        <p style={{ color: C.inkMuted, margin: 0, lineHeight: 1.6 }}>
          We could not load the reservation settings for {venue.name}. Nothing has changed. Try again
          in a moment.
        </p>
      </main>
    );
  }

  const bandSummary =
    config.bands.length === 0
      ? null
      : config.bands
          .slice()
          .sort((a, b) => a.partyMax - b.partyMax)
          .map((b) => `${b.name} (${b.partyMin} to ${b.partyMax})`)
          .join(" · ");

  return (
    <main style={{ padding: 24, maxWidth: 820, fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 6px", color: C.ink }}>Reservations</h1>
        <p style={{ color: C.inkMuted, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          The rules every table booking follows at {venue.name}. Times are that venue&rsquo;s own clock
          ({venue.timezone}).
        </p>
      </header>

      {/* What a venue can seat is the Spaces editor's answer, shown here as
          context so an operator can see WHY a party size is or is not offered
          without leaving the page. Read-only on purpose. */}
      <section
        style={{
          background: bandSummary ? C.accentSoft : C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 20,
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        {bandSummary ? (
          <>
            <strong style={{ color: C.ink }}>What you can seat: </strong>
            <span style={{ color: C.inkMuted }}>{bandSummary}</span>
          </>
        ) : (
          <>
            <strong style={{ color: C.ink }}>No tables set up yet. </strong>
            <span style={{ color: C.inkMuted }}>
              Reservations are offered against groups of tables, so nothing can be booked until{" "}
              {venue.name} has some.{" "}
            </span>
            <Link href={`/${tenantSlug}/admin/settings`} style={{ color: C.accent, fontWeight: 600 }}>
              Set up tables
            </Link>
          </>
        )}
      </section>

      <ReservationSettingsForm
        venueId={venue.id}
        timezone={venue.timezone}
        rules={config.rules}
        windows={config.windows}
        canGoLive={config.bands.length > 0}
      />
    </main>
  );
}
