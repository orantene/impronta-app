// Phase 3.10 — Client Discover page.
// Browse the agency's active roster. Client context: every profile links to
// an inquiry pre-filled with that talent.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadWorkspaceRosterEnriched } from "../../_data-bridge";
import { DiscoverShell } from "./DiscoverShell";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { NewInquiryButton } from "../_components/NewInquiryButton";
import { EmptyState } from "../_components/EmptyState";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
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
  const visible = roster.filter((r) => r.state === "published" || r.state === "claimed");

  const rosterForBtn = visible.map((r) => ({
    id: r.id,
    name: r.name,
    primaryTypeLabel: r.primaryTypeLabel,
    city: r.city,
  }));
  const clientForBtn = {
    displayName: clientProfile.displayName,
    company: clientProfile.company,
    agencyName: clientProfile.agencyName,
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Discover"
        title="Discover talent"
        subtitle={`Browse ${clientProfile.agencyName}'s roster. Click any profile to start an inquiry pre-filled with that talent.`}
        badge={visible.length > 0 ? <HeaderBadge>{visible.length} available</HeaderBadge> : undefined}
        actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={rosterForBtn} />}
      />

      {visible.length > 0 ? (
        <DiscoverShell roster={roster} tenantSlug={tenantSlug} />
      ) : (
        <EmptyState
          icon="🎭"
          title="Roster coming soon"
          body={`${clientProfile.agencyName} is setting up their roster. You can still send a brief and let the agency recommend the right fit.`}
          actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={rosterForBtn} label="Start inquiry" />}
        />
      )}
    </div>
  );
}
