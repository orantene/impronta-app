// Client favorites viewer.
//
// Lists the heart-saved talents (client_favorites). Sibling to the
// shortlists page — favorites is the lightweight "I want to remember
// this person" save without committing to an event/project context.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §2.5.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../_data-bridge";
import { loadClientFavoritesForUser } from "../../_data-bridge/discover";
import { FavoritesShell } from "./FavoritesShell";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { EmptyState } from "../_components/EmptyState";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function ClientFavoritesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const favorites = await loadClientFavoritesForUser(session.user.id);

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Favorites"
        title="Your favorites"
        subtitle="Talent you ♥ saved on Discover. Quick reference list — open a talent's drawer to inquire or add to a shortlist."
        badge={favorites.length > 0 ? <HeaderBadge>{favorites.length}</HeaderBadge> : undefined}
      />

      {favorites.length > 0 ? (
        <FavoritesShell favorites={favorites} tenantSlug={tenantSlug} />
      ) : (
        <EmptyState
          icon="♡"
          title="No favorites yet"
          body="Browse Discover and tap the ♥ on any talent to save them here."
        />
      )}
    </div>
  );
}
