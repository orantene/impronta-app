// Phase 3.4 — talent Inbox page.
// Shows inquiries the talent is involved in and links each one to the group thread.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile, loadTalentInquiries } from "../../_data-bridge";
import { InboxShell } from "./InboxShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:     "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  accent:  "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export default async function TalentInboxPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const inquiries = await loadTalentInquiries(talentProfile.id, scope.tenantId);

  const activeCount = inquiries.filter((i) =>
    ["submitted", "coordination", "offer_pending", "approved"].includes(i.status),
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
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
            : `${inquiries.length} total inquiry${inquiries.length !== 1 ? "s" : ""} · ${activeCount} active`}
        </p>
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
        <InboxShell inquiries={inquiries} tenantSlug={tenantSlug} />
      )}
    </div>
  );
}
