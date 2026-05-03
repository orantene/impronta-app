// Phase 3.3 — talent Calendar page.
// Shows upcoming booked events in a simple list view.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile, loadTalentInquiries } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
  indigoDeep:  "#2B3FA3",
  indigoSoft:  "rgba(43,63,163,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  } catch { return "—"; }
}

function fmtMonth(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  } catch { return iso; }
}

export default async function TalentCalendarPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const inquiries = await loadTalentInquiries(talentProfile.id, scope.tenantId);

  // Only show inquiries with event dates
  const withDates = inquiries
    .filter((i) => i.event_date)
    .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime());

  const upcoming = withDates.filter((i) => new Date(i.event_date!) >= new Date());
  const past     = withDates.filter((i) => new Date(i.event_date!) < new Date());

  // Group by month
  function groupByMonth(items: typeof withDates): Map<string, typeof withDates> {
    const map = new Map<string, typeof withDates>();
    for (const item of items) {
      const key = item.event_date!.slice(0, 7); // "YYYY-MM"
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }

  const upcomingByMonth = groupByMonth(upcoming);
  const pastByMonth     = groupByMonth(past);

  function EventRow({ inq }: { inq: typeof withDates[0] }) {
    const isBooked = inq.status === "booked" || inq.status === "converted";
    const dotColor = isBooked ? C.successDeep : C.indigoDeep;
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px 1fr",
          gap: 16,
          padding: "13px 16px",
          alignItems: "flex-start",
          borderBottom: `1px solid ${C.borderSoft}`,
          fontFamily: FONT,
        }}
      >
        {/* Date */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: isBooked ? C.successDeep : C.ink, letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {new Date(inq.event_date! + "T12:00:00").getDate()}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" as const, color: C.inkMuted, marginTop: 2 }}>
            {new Date(inq.event_date! + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })}
          </div>
        </div>

        {/* Details */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                background: isBooked ? C.successSoft : C.indigoSoft,
                color: isBooked ? C.successDeep : C.indigoDeep,
                textTransform: "uppercase" as const, letterSpacing: 0.3,
              }}
            >
              {isBooked ? "Booked" : inq.status.replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
            {inq.contact_name}
            {inq.company && (
              <span style={{ color: C.inkMuted, fontWeight: 400, marginLeft: 6 }}>· {inq.company}</span>
            )}
          </div>
          {inq.event_location && (
            <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>{inq.event_location}</div>
          )}
        </div>
      </div>
    );
  }

  function MonthGroup({ monthKey, items }: { monthKey: string; items: typeof withDates }) {
    return (
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 8, fontFamily: FONT }}>
          {fmtMonth(monthKey + "-01")}
        </div>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
          {items.map((inq) => (
            <EventRow key={inq.id} inq={inq} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
          {talentProfile.agencyName}
        </div>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>
          Calendar
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, margin: "4px 0 0" }}>
          {withDates.length === 0 ? "No scheduled events." : `${upcoming.length} upcoming · ${past.length} past`}
        </p>
      </div>

      {withDates.length === 0 ? (
        <div style={{ padding: "48px 20px", textAlign: "center", background: "rgba(11,11,13,0.02)", border: "1px dashed rgba(24,24,27,0.08)", borderRadius: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No events scheduled</div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 320, lineHeight: 1.5 }}>
            Events with confirmed dates will appear here once your agency assigns a date to your inquiries.
          </p>
        </div>
      ) : (
        <>
          {upcomingByMonth.size > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>Upcoming</div>
              {[...upcomingByMonth.entries()].map(([key, items]) => (
                <MonthGroup key={key} monthKey={key} items={items} />
              ))}
            </div>
          )}

          {pastByMonth.size > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: 0.75 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.inkMuted, letterSpacing: -0.1 }}>Past</div>
              {[...pastByMonth.entries()].reverse().map(([key, items]) => (
                <MonthGroup key={key} monthKey={key} items={items} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
