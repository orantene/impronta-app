// Admin · Discover-originated inquiries.
//
// Surfaces every inquiry routed to this workspace from a Discover
// submission — single-talent direct or multi-talent shortlist fan-out.
// Closes the cross-tenant feedback loop: agencies can see at-a-glance
// what's coming in via Discover vs other paths.
//
// URL-only for now (not added to admin nav) — link from emails or paste
// directly. Promotion to first-class nav can come with broader admin-side
// Discover analytics (A3/A4/A5/A6/A8/A9 from the spec audit).

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadAdminDiscoverInquiries,
  type AdminDiscoverInquiry,
} from "../../_data-bridge/discover";
import { AdminDiscoverInquiriesShell } from "./AdminDiscoverInquiriesShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{ source?: string; status?: string }>;

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
} as const;

// Filter buckets — server-rendered <a> chips. Source covers the two
// Discover origin modes; status maps onto the existing 4-family mental
// model used elsewhere across the app.
const SOURCE_FILTERS = [
  { key: "all",       label: "All sources",  matches: () => true },
  { key: "single",    label: "Direct",       matches: (i: AdminDiscoverInquiry) => i.sourceChannel === "discover_single_talent" },
  { key: "shortlist", label: "Shortlist",    matches: (i: AdminDiscoverInquiry) => i.sourceChannel === "discover_shortlist" },
] as const;

const STATUS_FILTERS = [
  { key: "all",       label: "All statuses", matches: () => true },
  { key: "open",      label: "Open",         matches: (i: AdminDiscoverInquiry) => ["new", "submitted", "coordination"].includes(i.status) },
  { key: "offer",     label: "Offer",        matches: (i: AdminDiscoverInquiry) => i.status === "offer_pending" || i.status === "approved" },
  { key: "won",       label: "Won",          matches: (i: AdminDiscoverInquiry) => i.status === "booked" || i.status === "converted" },
  { key: "closed",    label: "Closed",       matches: (i: AdminDiscoverInquiry) => ["rejected", "expired", "closed", "closed_lost", "archived"].includes(i.status) },
] as const;

type SourceKey = (typeof SOURCE_FILTERS)[number]["key"];
type StatusKey = (typeof STATUS_FILTERS)[number]["key"];

function chipHref(
  tenantSlug: string,
  source: SourceKey,
  status: StatusKey,
): string {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (status !== "all") params.set("status", status);
  const qs = params.toString();
  const base = `/${tenantSlug}/admin/discover-inquiries`;
  return qs ? `${base}?${qs}` : base;
}

function FilterChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 12px",
        borderRadius: 999,
        textDecoration: "none",
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        color: active ? "#fff" : C.inkMuted,
        background: active ? C.ink : "rgba(11,11,13,0.04)",
        border: `1px solid ${active ? C.ink : C.borderSoft}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: active ? "rgba(255,255,255,0.65)" : C.inkDim,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </a>
  );
}

export default async function AdminDiscoverInquiriesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const { source: rawSource, status: rawStatus } = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const allInquiries = await loadAdminDiscoverInquiries(scope.tenantId);
  const activeSource: SourceKey =
    SOURCE_FILTERS.find((f) => f.key === rawSource)?.key ?? "all";
  const activeStatus: StatusKey =
    STATUS_FILTERS.find((f) => f.key === rawStatus)?.key ?? "all";

  const sourceMatch = SOURCE_FILTERS.find((f) => f.key === activeSource)!.matches;
  const statusMatch = STATUS_FILTERS.find((f) => f.key === activeStatus)!.matches;
  const inquiries = allInquiries.filter(
    (i) => sourceMatch(i) && statusMatch(i),
  );

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: "rgba(11,11,13,0.55)",
          marginBottom: 6,
        }}>
          Admin · Discover
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: "#0B0B0D",
          margin: 0, marginBottom: 6, letterSpacing: -0.4,
        }}>
          Discover inquiries
          {allInquiries.length > 0 && (
            <span style={{
              marginLeft: 10, fontSize: 13, fontWeight: 600,
              padding: "3px 9px", borderRadius: 999,
              background: "rgba(15,79,62,0.10)", color: "#0F4F3E",
              verticalAlign: "middle",
            }}>
              {allInquiries.length}
            </span>
          )}
        </h1>
        <p style={{
          fontSize: 13, color: "rgba(11,11,13,0.55)",
          margin: 0, lineHeight: 1.5, maxWidth: 600,
        }}>
          Inquiries routed to this workspace from Tulala Discover.
          Single-talent inquiries arrive direct; shortlist fan-outs
          arrive as one inquiry per workspace — your row covers only the
          talents on this workspace&apos;s roster.
        </p>
      </div>

      {allInquiries.length > 0 && (
        <div style={{ marginBottom: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SOURCE_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                href={chipHref(tenantSlug, f.key, activeStatus)}
                label={f.label}
                count={allInquiries.filter((i) => f.matches(i) && statusMatch(i)).length}
                active={f.key === activeSource}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                href={chipHref(tenantSlug, activeSource, f.key)}
                label={f.label}
                count={allInquiries.filter((i) => f.matches(i) && sourceMatch(i)).length}
                active={f.key === activeStatus}
              />
            ))}
          </div>
        </div>
      )}

      <AdminDiscoverInquiriesShell inquiries={inquiries} tenantSlug={tenantSlug} />
    </div>
  );
}
