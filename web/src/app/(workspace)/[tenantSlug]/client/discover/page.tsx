// Phase 3.10 — Client Discover page.
// Browse the agency's active roster. Client context: every profile links to
// an inquiry pre-filled with that talent.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadWorkspaceRosterEnriched } from "../../_data-bridge";
import { DiscoverShell } from "./DiscoverShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "rgba(11,11,13,0.02)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function ClientDiscoverPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const roster = await loadWorkspaceRosterEnriched(scope.tenantId);
  const visible = roster.filter((r) => r.state === "published");

  return (
    <div style={{ fontFamily: FONT }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          Discover talent
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
          Browse {clientProfile.agencyName}&apos;s roster.
          {visible.length > 0 && ` ${visible.length} talent available for bookings.`}
        </p>
      </div>

      {visible.length > 0 ? (
        <DiscoverShell roster={roster} tenantSlug={tenantSlug} />
      ) : (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            Roster coming soon
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
            {clientProfile.agencyName} is setting up their roster. Reach out directly to submit an inquiry.
          </p>
        </div>
      )}
    </div>
  );
}
