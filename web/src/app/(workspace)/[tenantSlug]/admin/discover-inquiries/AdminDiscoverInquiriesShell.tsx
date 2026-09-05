// Admin · Discover-inquiries view.
//
// Lightweight list of Discover-originated inquiries for this workspace.
// Each row shows the talent thumbs (so you immediately see who's being
// asked for), the source-channel badge, status, when, where, and who.
// Click → admin Messages route (existing inquiry detail surface) so we
// don't reinvent the inquiry workspace UI.

import Link from "next/link";
import type { AdminDiscoverInquiry } from "../../_data-bridge/discover";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  amber:      "var(--color-admin-amber)",
  amberSoft:  "rgba(180,130,20,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function AdminDiscoverInquiriesShell({
  inquiries,
  tenantSlug,
}: {
  inquiries: AdminDiscoverInquiry[];
  tenantSlug: string;
}) {
  if (inquiries.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: "center",
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        borderRadius: 14, fontFamily: FONT, color: C.inkMuted, fontSize: 13,
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🪐</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
          No Discover inquiries yet
        </div>
        <p style={{ fontSize: 12.5, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
          When clients send inquiries from Tulala Discover that route to talent on
          this workspace&apos;s roster, they&apos;ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT }}>
      {inquiries.map((i) => (
        <Row key={i.inquiryId} inquiry={i} tenantSlug={tenantSlug} />
      ))}
    </div>
  );
}

function ClientTrustPill({ tier }: { tier: "basic" | "verified" | "silver" | "gold" }) {
  // Visual ladder per project_client_trust_badges.md. Drives risk
  // signal on agency intake — gold = top trust, basic = unverified.
  const styleMap: Record<typeof tier, { label: string; bg: string; color: string; emoji: string }> = {
    basic:    { label: "Basic",    bg: "rgba(11,11,13,0.06)",     color: C.inkMuted, emoji: "○" },
    verified: { label: "Verified", bg: "rgba(46,125,91,0.10)",    color: "#1B5C45",  emoji: "✓" },
    // Silver + Gold are the trust LADDER's scoped semantics (RULING 2026-09-05):
    // a tier named Gold keeps a gold treatment as a scoped token, never the
    // de-golded admin chrome amber. #1773 slated Gold by mistake; restored here.
    silver:   { label: "Silver",   bg: "var(--color-admin-tier-silver-wash)",   color: "var(--color-admin-tier-silver)",  emoji: "✦" },
    gold:     { label: "Gold",     bg: "var(--color-admin-tier-gold-wash)",   color: "var(--color-admin-tier-gold)",  emoji: "★" },
  };
  const s = styleMap[tier];
  return (
    <span
      title={`Client trust tier: ${s.label}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "2px 8px", borderRadius: 4,
        background: s.bg, color: s.color,
      }}
    >
      <span aria-hidden style={{ fontSize: 9 }}>{s.emoji}</span>
      {s.label}
    </span>
  );
}

function Row({
  inquiry,
  tenantSlug,
}: {
  inquiry: AdminDiscoverInquiry;
  tenantSlug: string;
}) {
  const detailHref = `/${tenantSlug}/admin/messages?inquiry=${inquiry.inquiryId}`;
  const sourceLabel = inquiry.sourceChannel === "discover_shortlist"
    ? "Discover · shortlist fan-out"
    : "Discover · single talent";

  return (
    <Link
      href={detailHref}
      style={{
        display: "block",
        background: C.cardBg, border: `1px solid ${C.borderSoft}`,
        borderRadius: 12, padding: 14,
        textDecoration: "none", color: "inherit",
        transition: "border-color 150ms, box-shadow 150ms",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 4,
              background: C.accentSoft, color: C.accent,
            }}>
              {sourceLabel}
            </span>
            {inquiry.isPartOfFanout && (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                padding: "2px 8px", borderRadius: 4,
                background: C.amberSoft, color: C.amber,
              }}
              title="This inquiry is one of N — sibling agencies received their own copy with their slice of the talents.">
                ⇄ part of multi-workspace fanout
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
              textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 4,
              background: "rgba(11,11,13,0.06)", color: C.inkMuted,
            }}>
              {inquiry.status.replace(/_/g, " ")}
            </span>
            {inquiry.clientTrustTier && <ClientTrustPill tier={inquiry.clientTrustTier} />}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
            {inquiry.contactName ?? "Unknown client"}
            {inquiry.eventDate && (
              <span style={{ fontWeight: 400, color: C.inkMuted, marginLeft: 8 }}>
                · {inquiry.eventDate}
              </span>
            )}
          </div>
          {inquiry.eventLocation && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 6 }}>
              📍 {inquiry.eventLocation}
            </div>
          )}
          {inquiry.message && (
            <div style={{
              fontSize: 12.5, color: C.ink, lineHeight: 1.5,
              padding: "8px 10px", borderRadius: 8,
              background: C.surface, border: `1px solid ${C.borderSoft}`,
              marginTop: 6, marginBottom: 4,
            }}>
              {inquiry.message}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 6 }}>
            {new Date(inquiry.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3,
            textTransform: "uppercase", color: C.inkDim,
          }}>
            {inquiry.talents.length} {inquiry.talents.length === 1 ? "talent" : "talents"}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
            {inquiry.talents.slice(0, 6).map((t) => (
              <div
                key={t.talentId}
                title={t.displayName}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: t.headshotUrl
                    ? `url(${t.headshotUrl}) center/cover no-repeat`
                    : C.accentSoft,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: C.accent,
                  border: `1.5px solid ${C.cardBg}`,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {!t.headshotUrl && t.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
              </div>
            ))}
            {inquiry.talents.length > 6 && (
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: C.surface, color: C.inkMuted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600,
                }}
              >
                +{inquiry.talents.length - 6}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
