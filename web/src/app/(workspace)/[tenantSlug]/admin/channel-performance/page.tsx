// Phase F — Channel performance (the gate-unblocker).
//
// When XTENANT_REHOME flips, a hub that SOURCED a lead loses inbox
// visibility of it once an exclusive agency re-homes it (inbox loaders
// filter inquiries.tenant_id; after re-home that's the managing agency,
// not the originating hub). This read-only report replaces that lost
// line of sight: it keys off inquiries.source_workspace_id = this tenant
// (the frozen originating channel) so the hub always sees the leads it
// sourced — regardless of who now manages them — plus the referral money
// it earned as the originating channel.
//
// URL-only for now — sibling to /admin/discover-performance, which is
// also URL-only until the Operations nav extraction. Read-only,
// dark/additive: nothing here is flag-gated; it simply reads whatever
// channel attribution already exists.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadChannelPerformance } from "@/lib/discover/channel-performance";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#1D4ED8",
} as const;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function convRate(leads: number, conversions: number): string {
  if (leads <= 0) return "0%";
  return `${Math.round((conversions / leads) * 100)}%`;
}

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: C.inkDim,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "11px 12px",
  fontSize: 13,
  color: C.ink,
  borderBottom: `1px solid ${C.borderSoft}`,
  fontVariantNumeric: "tabular-nums",
};

export default async function AdminChannelPerformancePage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const perf = await loadChannelPerformance({ tenantId: scope.tenantId });

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: C.inkMuted,
            marginBottom: 6,
          }}
        >
          Admin · Channel
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: C.ink,
            margin: 0,
            marginBottom: 6,
            letterSpacing: -0.4,
          }}
        >
          Channel performance
        </h1>
        <p
          style={{
            fontSize: 13,
            color: C.inkMuted,
            margin: 0,
            lineHeight: 1.55,
            maxWidth: 660,
          }}
        >
          Leads your workspace <strong>sourced</strong> — keyed to the
          originating channel (<code>source_workspace_id</code>), so you keep
          line of sight on a lead even after another agency takes over managing
          it.{" "}
          <Link
            href={`/${tenantSlug}/admin/discover-performance`}
            style={{ color: C.accent, fontWeight: 600 }}
          >
            Discover performance →
          </Link>
        </p>
      </div>

      {/* ── Summary row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          { label: "Leads sourced", value: String(perf.totalLeads) },
          {
            label: "Converted",
            value: `${perf.totalConversions} · ${convRate(perf.totalLeads, perf.totalConversions)}`,
          },
          { label: "Referral earned", value: formatMoney(perf.referralEarnedCents) },
          { label: "Referral bookings", value: String(perf.referralBookingCount) },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: C.inkDim,
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.ink,
                letterSpacing: -0.4,
                lineHeight: 1.1,
              }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Per-channel table ── */}
      {perf.byChannel.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
            color: C.inkMuted,
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No sourced leads yet
          </div>
          <p style={{ fontSize: 12.5, margin: "0 auto", maxWidth: 420, lineHeight: 1.5 }}>
            Leads attributed to this workspace as the originating channel will
            appear here, broken down by source channel, once they exist.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Source channel</th>
                <th style={{ ...TH, textAlign: "right" }}>Leads</th>
                <th style={{ ...TH, textAlign: "right" }}>Conversions</th>
                <th style={{ ...TH, textAlign: "right" }}>Conv. rate</th>
              </tr>
            </thead>
            <tbody>
              {perf.byChannel.map((row) => (
                <tr key={row.channel}>
                  <td style={TD}>{row.channel}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{row.leads}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{row.conversions}</td>
                  <td style={{ ...TD, textAlign: "right", color: C.inkMuted }}>
                    {convRate(row.leads, row.conversions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 11.5, color: C.inkDim, lineHeight: 1.5 }}>
        Read-only snapshot. Numbers refresh on every page load — no caching.
        Leads:{" "}
        <code>inquiries.source_workspace_id = this workspace</code>. Referral
        earned: <code>SUM(booking_commission_snapshot.channel_referral_cents)</code>{" "}
        where <code>channel_referral_party_id = this workspace</code>.
      </p>
    </div>
  );
}
