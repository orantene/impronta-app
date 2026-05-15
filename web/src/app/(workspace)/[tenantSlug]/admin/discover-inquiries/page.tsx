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
import { loadAdminDiscoverInquiries } from "../../_data-bridge/discover";
import { AdminDiscoverInquiriesShell } from "./AdminDiscoverInquiriesShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function AdminDiscoverInquiriesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const inquiries = await loadAdminDiscoverInquiries(scope.tenantId);

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
          {inquiries.length > 0 && (
            <span style={{
              marginLeft: 10, fontSize: 13, fontWeight: 600,
              padding: "3px 9px", borderRadius: 999,
              background: "rgba(15,79,62,0.10)", color: "#0F4F3E",
              verticalAlign: "middle",
            }}>
              {inquiries.length}
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
      <AdminDiscoverInquiriesShell inquiries={inquiries} tenantSlug={tenantSlug} />
    </div>
  );
}
