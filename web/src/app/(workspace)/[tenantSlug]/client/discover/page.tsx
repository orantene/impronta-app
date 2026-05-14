// Discover — cross-tenant talent catalog for paying clients.
//
// Evolution of the original tenant-scoped roster browse (was:
// loadWorkspaceRosterEnriched). Now reads from loadDiscoverTalents
// which surfaces is_discoverable=true talents across ALL tenants — the
// canonical Tulala Discover catalog. Spec:
//   web/docs/discover-and-unified-inquiry-2026-05-14.md
//
// Client tier (Standard/Pro/Enterprise) gates power tools (compare,
// shortlists, multi-inquiry, rate band visibility). Browsing the
// catalog itself is free for any authenticated client.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../_data-bridge";
import { loadDiscoverTalents, loadDiscoverFacets, loadDiscoverHubs } from "../../_data-bridge/discover";
import { loadClientSubscription, canUsePro } from "@/lib/discover/client-subscription";
import { DiscoverShell } from "./DiscoverShell";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { EmptyState } from "../_components/EmptyState";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{
  country?: string;
  category?: string;
  hub?: string;
  q?: string;
}>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function ClientDiscoverPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const sp = await searchParams;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  // Parallel SSR loads: paginated talents + filter facets + hubs + tier.
  const [{ items, total }, facets, hubs, subscription] = await Promise.all([
    loadDiscoverTalents({
      country: sp.country,
      category: sp.category,
      hub: sp.hub,
      q: sp.q,
      limit: 24,
      offset: 0,
    }),
    loadDiscoverFacets(),
    loadDiscoverHubs(),
    loadClientSubscription(session.user.id),
  ]);
  const hasPro = canUsePro(subscription);

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Discover"
        title="Discover talent"
        subtitle="Find talent across every Tulala hub and independent profile. Save favorites, build shortlists, send one inquiry that routes to the right agency for each talent."
        badge={total > 0 ? <HeaderBadge>{total} on Discover</HeaderBadge> : undefined}
      />

      {!hasPro && (
        <div
          style={{
            margin: "0 0 16px 0", padding: "12px 16px",
            background: "linear-gradient(135deg, rgba(15,79,62,0.08), rgba(15,79,62,0.02))",
            border: "1px solid rgba(15,79,62,0.20)",
            borderRadius: 12,
            fontSize: 12.5, color: "#0B0B0D",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          <strong style={{ color: "#0F4F3E", fontWeight: 700, letterSpacing: 0.3, fontSize: 10.5, textTransform: "uppercase" }}>Standard tier</strong>
          {" — Browse + heart + 1 shortlist + single-talent inquiry are free. "}
          <strong>Compare</strong>, <strong>multi-talent fan-out</strong>, and rate visibility unlock with Pro.
        </div>
      )}

      {items.length > 0 || sp.country || sp.category || sp.hub || sp.q ? (
        <DiscoverShell
          initialItems={items}
          initialTotal={total}
          facets={facets}
          hubs={hubs}
          tenantSlug={tenantSlug}
          activeFilters={{
            country: sp.country ?? null,
            category: sp.category ?? null,
            hub: sp.hub ?? null,
            q: sp.q ?? null,
          }}
        />
      ) : (
        <EmptyState
          icon="🪐"
          title="Discover is warming up"
          body="No talents have enabled Discover yet. Talents control their own visibility — once they toggle on, they'll appear here. Check back soon, or browse your agency's roster directly."
        />
      )}
    </div>
  );
}
