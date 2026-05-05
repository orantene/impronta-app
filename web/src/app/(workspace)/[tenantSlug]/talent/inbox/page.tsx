// Phase 3.4 — talent Inbox page.
// Shows inquiries the talent is involved in and links each one to the group thread.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadTalentSelfProfile,
  loadTalentInquiries,
  type TalentInquiryRow,
} from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep: "#8A6F1A",
  amberSoft: "rgba(138,111,26,0.10)",
  indigoDeep: "#2B3FA3",
  indigoSoft: "rgba(43,63,163,0.07)",
  blueDeep: "#1D4ED8",
  blueSoft: "rgba(29,78,216,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function relativeDate(iso: string): string {
  const diffH = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 30) return `${Math.floor(diffD)}d ago`;
  return fmtDate(iso);
}

function statusTone(status: string): { bg: string; color: string; label: string } {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked: { bg: C.successSoft, color: C.successDeep, label: "Booked" },
    converted: { bg: C.successSoft, color: C.successDeep, label: "Booked" },
    approved: { bg: C.accentSoft, color: C.accent, label: "Approved" },
    offer_pending: { bg: C.amberSoft, color: C.amberDeep, label: "Offer pending" },
    submitted: { bg: C.indigoSoft, color: C.indigoDeep, label: "Submitted" },
    coordination: { bg: C.indigoSoft, color: C.indigoDeep, label: "In review" },
    rejected: { bg: C.surfaceAlt, color: C.inkDim, label: "Rejected" },
    expired: { bg: C.surfaceAlt, color: C.inkDim, label: "Expired" },
    closed_lost: { bg: C.surfaceAlt, color: C.inkDim, label: "Closed" },
    draft: { bg: C.surfaceAlt, color: C.inkDim, label: "Draft" },
  };
  return map[status] ?? { bg: C.surfaceAlt, color: C.inkDim, label: status.replace(/_/g, " ") };
}

function SectionGroup({
  title,
  count,
  items,
  tenantSlug,
}: {
  title: string;
  count: number;
  items: TalentInquiryRow[];
  tenantSlug: string;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.inkMuted,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
        {items.map((inq, idx) => {
          const s = statusTone(inq.status);
          return (
            <div
              key={inq.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "13px 16px",
                borderBottom: idx < items.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                fontFamily: FONT,
                background: inq.unreadCount > 0 ? C.blueSoft : "transparent",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: C.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {inq.contact_name}
                  {inq.company && (
                    <span style={{ color: C.inkMuted, fontWeight: 400, marginLeft: 6 }}>
                      · {inq.company}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, color: C.inkMuted }}>
                    {[inq.event_location, fmtDate(inq.event_date)].filter(Boolean).join(" · ") || "No event date"}
                  </span>
                  {inq.unreadCount > 0 ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: C.blueDeep,
                        background: C.blueSoft,
                        borderRadius: 999,
                        padding: "1px 7px",
                      }}
                    >
                      {inq.unreadCount} new
                    </span>
                  ) : null}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: s.bg,
                    color: s.color,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {s.label}
                </span>
                <span style={{ fontSize: 11, color: C.inkDim }}>{relativeDate(inq.created_at)}</span>
                <Link
                  href={`/${tenantSlug}/talent/inbox/${inq.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.borderSoft}`,
                    color: C.blueDeep,
                    fontSize: 11.5,
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Open thread
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function TalentInboxPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const inquiries = await loadTalentInquiries(talentProfile.id, scope.tenantId);

  const activeInquiries = inquiries.filter((i) =>
    ["submitted", "coordination", "offer_pending", "approved"].includes(i.status),
  );
  const bookedInquiries = inquiries.filter(
    (i) => i.status === "booked" || i.status === "converted",
  );
  const closedInquiries = inquiries.filter((i) =>
    ["rejected", "expired", "closed_lost", "closed"].includes(i.status),
  );
  const shownIds = new Set(
    [...activeInquiries, ...bookedInquiries, ...closedInquiries].map((i) => i.id),
  );
  const otherInquiries = inquiries.filter((i) => !shownIds.has(i.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
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
            {talentProfile.agencyName}
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
            }}
          >
            Inbox
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, margin: "4px 0 0" }}>
            {inquiries.length === 0
              ? "No inquiries yet."
              : `${inquiries.length} total inquiry${inquiries.length !== 1 ? "s" : ""} · ${activeInquiries.length} active`}
          </p>
        </div>
      </div>

      {inquiries.length === 0 ? (
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            background: "rgba(11,11,13,0.02)",
            border: "1px dashed rgba(24,24,27,0.08)",
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            Your inbox is empty
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 340, lineHeight: 1.5 }}>
            Once your agency adds you to inquiries, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <>
          <SectionGroup
            title="Active"
            count={activeInquiries.length}
            items={activeInquiries}
            tenantSlug={tenantSlug}
          />
          <SectionGroup
            title="Booked"
            count={bookedInquiries.length}
            items={bookedInquiries}
            tenantSlug={tenantSlug}
          />
          <SectionGroup
            title="Closed"
            count={closedInquiries.length}
            items={closedInquiries}
            tenantSlug={tenantSlug}
          />
          <SectionGroup
            title="Other"
            count={otherInquiries.length}
            items={otherInquiries}
            tenantSlug={tenantSlug}
          />
        </>
      )}
    </div>
  );
}
