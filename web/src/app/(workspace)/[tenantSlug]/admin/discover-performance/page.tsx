// A9 — Workspace Discover performance dashboard.
//
// Standalone admin surface that rolls up Discover-originated inquiries
// + bookings for this tenant. Lives outside the mega Settings/
// Operations shell so it can ship without unblocking those extractions
// first. Sibling to /admin/discover-inquiries (which is the list view);
// this is the metrics view.
//
// URL-only for now — promote to nav with the Operations extraction.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{ range?: string }>;

const TIME_RANGES = [
  { key: "7d",  label: "Last 7 days",  days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
] as const;
type RangeKey = (typeof TIME_RANGES)[number]["key"];
function resolveRange(raw: string | undefined): RangeKey {
  return TIME_RANGES.find((r) => r.key === raw)?.key ?? "30d";
}

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.08)",
} as const;

type DiscoverMetrics = {
  window: {
    totalInquiries: number;
    singleTalent: number;
    shortlist: number;
    convertedToBooked: number;
    talentsReached: number;
  };
  topTalents: Array<{ talentId: string; displayName: string; inquiryCount: number }>;
  topCountries: Array<{ country: string; inquiryCount: number }>;
};

async function loadDiscoverMetrics(
  tenantId: string,
  rangeDays: number,
): Promise<DiscoverMetrics> {
  const admin = createServiceRoleClient();
  const empty: DiscoverMetrics = {
    window: { totalInquiries: 0, singleTalent: 0, shortlist: 0, convertedToBooked: 0, talentsReached: 0 },
    topTalents: [],
    topCountries: [],
  };
  if (!admin) return empty;

  const sinceIso = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  // Pull every Discover-channel inquiry for this tenant in the last 30 days
  // with the participant + event metadata we need for the rollup. Single
  // query rather than 4 small ones — the row count for a single workspace
  // even on a busy month is hundreds, not thousands.
  const { data: rows, error } = await admin
    .from("inquiries")
    .select(
      `
      id, status, event_location, created_at, source_channel,
      inquiry_participants!inquiry_id (
        role,
        talent_profile_id,
        talent_profiles!talent_profile_id ( id, display_name, first_name, last_name )
      )
      `,
    )
    .eq("tenant_id", tenantId)
    .in("source_channel", ["discover_single_talent", "discover_shortlist"])
    .gte("created_at", sinceIso);

  if (error) {
    logServerError("admin.discoverPerformance.load", error);
    return empty;
  }

  type Row = {
    id: string;
    status: string;
    event_location: string | null;
    created_at: string;
    source_channel: string;
    inquiry_participants: Array<{
      role: string;
      talent_profile_id: string | null;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
      } | null;
    }> | null;
  };

  const inquiries = (rows ?? []) as unknown as Row[];

  let singleTalent = 0;
  let shortlist = 0;
  let convertedToBooked = 0;
  const talentSet = new Set<string>();
  const talentCounts = new Map<string, { name: string; count: number }>();
  const countryCounts = new Map<string, number>();

  for (const inq of inquiries) {
    if (inq.source_channel === "discover_single_talent") singleTalent++;
    else if (inq.source_channel === "discover_shortlist") shortlist++;

    if (inq.status === "booked" || inq.status === "converted") convertedToBooked++;

    const talentParts = (inq.inquiry_participants ?? []).filter((p) => p.role === "talent");
    for (const p of talentParts) {
      const t = p.talent_profiles;
      if (!t) continue;
      talentSet.add(t.id);
      const name =
        (t.display_name ?? "").trim() ||
        `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() ||
        "Unnamed";
      const cur = talentCounts.get(t.id) ?? { name, count: 0 };
      talentCounts.set(t.id, { name, count: cur.count + 1 });
    }

    // Crude country derivation from event_location ("City, Country" → last segment).
    // Not perfect — talent home country would be better — but the inquiry's
    // event_location is the buyer-side signal a workspace cares about.
    if (inq.event_location) {
      const parts = inq.event_location.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        const country = parts[parts.length - 1];
        countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
      }
    }
  }

  const topTalents = Array.from(talentCounts.entries())
    .map(([id, v]) => ({ talentId: id, displayName: v.name, inquiryCount: v.count }))
    .sort((a, b) => b.inquiryCount - a.inquiryCount)
    .slice(0, 5);

  const topCountries = Array.from(countryCounts.entries())
    .map(([country, count]) => ({ country, inquiryCount: count }))
    .sort((a, b) => b.inquiryCount - a.inquiryCount)
    .slice(0, 5);

  return {
    window: {
      totalInquiries: inquiries.length,
      singleTalent,
      shortlist,
      convertedToBooked,
      talentsReached: talentSet.size,
    },
    topTalents,
    topCountries,
  };
}

function MetricCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 16,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
        textTransform: "uppercase", color: C.inkDim,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: -0.5, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function AdminDiscoverPerformancePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const { range: rawRange } = await searchParams;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const activeRange: RangeKey = resolveRange(rawRange);
  const rangeMeta = TIME_RANGES.find((r) => r.key === activeRange)!;

  const metrics = await loadDiscoverMetrics(scope.tenantId, rangeMeta.days);
  const { window: w, topTalents, topCountries } = metrics;
  const conversionPct =
    w.totalInquiries > 0
      ? Math.round((w.convertedToBooked / w.totalInquiries) * 100)
      : 0;

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: C.inkMuted, marginBottom: 6,
        }}>
          Admin · Discover
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: C.ink,
          margin: 0, marginBottom: 6, letterSpacing: -0.4,
        }}>
          Discover performance
        </h1>
        <p style={{
          fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.55,
          maxWidth: 640,
        }}>
          {rangeMeta.label} of inquiries routed to this workspace from Tulala
          Discover.{" "}
          <Link href={`/${tenantSlug}/admin/discover-inquiries`} style={{ color: C.accent, fontWeight: 600 }}>
            See the row-level list →
          </Link>
        </p>
      </div>

      {/* ── Time-range chip toggle ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {TIME_RANGES.map((r) => {
          const active = r.key === activeRange;
          const href =
            r.key === "30d"
              ? `/${tenantSlug}/admin/discover-performance`
              : `/${tenantSlug}/admin/discover-performance?range=${r.key}`;
          return (
            <a
              key={r.key}
              href={href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 28,
                padding: "0 12px",
                borderRadius: 999,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? "#fff" : C.inkMuted,
                background: active ? C.ink : "rgba(11,11,13,0.04)",
                border: `1px solid ${active ? C.ink : C.borderSoft}`,
                whiteSpace: "nowrap",
              }}
            >
              {r.label}
            </a>
          );
        })}
      </div>

      {w.totalInquiries === 0 ? (
        <div style={{
          padding: 32, textAlign: "center",
          background: C.surface, border: `1px dashed ${C.borderSoft}`,
          borderRadius: 14, color: C.inkMuted, fontSize: 13,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No Discover inquiries in the {rangeMeta.label.toLowerCase()}
          </div>
          <p style={{ fontSize: 12.5, margin: "0 auto", maxWidth: 380, lineHeight: 1.5 }}>
            Make sure talent on your roster are enrolled (per-talent toggle on
            the roster edit page) and your workspace plan tier supports
            Discover placement.
          </p>
        </div>
      ) : (
        <>
          {/* ── Top-line metric cards ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}>
            <MetricCard label="Total inquiries" value={w.totalInquiries} sub={rangeMeta.label} />
            <MetricCard
              label="From direct"
              value={w.singleTalent}
              sub={`${w.totalInquiries > 0
                ? Math.round((w.singleTalent / w.totalInquiries) * 100)
                : 0}% of total`}
            />
            <MetricCard
              label="From shortlist"
              value={w.shortlist}
              sub={`${w.totalInquiries > 0
                ? Math.round((w.shortlist / w.totalInquiries) * 100)
                : 0}% of total`}
            />
            <MetricCard
              label="Talents reached"
              value={w.talentsReached}
              sub="Unique participants"
            />
            <MetricCard
              label="Converted"
              value={`${conversionPct}%`}
              sub={`${w.convertedToBooked} of ${w.totalInquiries} booked`}
            />
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}>
            {/* ── Top talents by inquiry count ── */}
            <section style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", color: C.inkDim, marginBottom: 10,
              }}>
                Top talents — {rangeMeta.label.toLowerCase()}
              </div>
              {topTalents.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.inkMuted }}>No data yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topTalents.map((t, i) => (
                    <div key={t.talentId} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      fontSize: 13, color: C.ink,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: C.accentSoft, color: C.accent,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11.5, fontWeight: 700,
                      }}>
                        {i + 1}
                      </div>
                      <div style={{
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {t.displayName}
                      </div>
                      <div style={{ fontSize: 12, color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                        {t.inquiryCount} {t.inquiryCount === 1 ? "inquiry" : "inquiries"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Top countries by inquiry event_location ── */}
            <section style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", color: C.inkDim, marginBottom: 10,
              }}>
                Top event locations — {rangeMeta.label.toLowerCase()}
              </div>
              {topCountries.length === 0 ? (
                <div style={{ fontSize: 12.5, color: C.inkMuted }}>No location data yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topCountries.map((c, i) => (
                    <div key={c.country + i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      fontSize: 13, color: C.ink,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: C.successSoft, color: C.success,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11.5, fontWeight: 700,
                      }}>
                        {i + 1}
                      </div>
                      <div style={{
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {c.country}
                      </div>
                      <div style={{ fontSize: 12, color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                        {c.inquiryCount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p style={{
            marginTop: 24, fontSize: 11.5, color: C.inkDim, lineHeight: 1.5,
          }}>
            Read-only snapshot. Numbers refresh on every page load — no caching.
            Source: <code>inquiries.source_channel ∈ {`{discover_single_talent, discover_shortlist}`}</code>
            joined with <code>inquiry_participants</code>.
          </p>
        </>
      )}
    </div>
  );
}
