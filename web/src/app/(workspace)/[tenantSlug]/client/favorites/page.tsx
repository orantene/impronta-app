// Client favorites viewer.
//
// Lists the heart-saved talents (client_favorites). Sibling to the
// shortlists page — favorites is the lightweight "I want to remember
// this person" save without committing to an event/project context.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §2.5.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestLocale } from "@/i18n/request-locale";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../_data-bridge";
import { loadClientFavoritesForUser } from "../../_data-bridge/discover";
import { loadClientCardDesign } from "../_data-bridge/load-card-design";
import { FavoritesShell } from "./FavoritesShell";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { EmptyState } from "../_components/EmptyState";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function ClientFavoritesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [favorites, cardDesign] = await Promise.all([
    loadClientFavoritesForUser(session.user.id),
    loadClientCardDesign(scope.tenantId),
  ]);

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Favorites"
        title="Your favorites"
        subtitle="Talent you ♥ saved on Discover. Quick reference list. Open a talent's drawer to inquire or add to a shortlist."
        badge={favorites.length > 0 ? <HeaderBadge>{favorites.length}</HeaderBadge> : undefined}
      />

      {favorites.length > 0 ? (
        <FavoritesShell favorites={favorites} tenantSlug={tenantSlug} cardDesign={cardDesign} locale={locale} />
      ) : (
        <EmptyState
          icon="♡"
          title="No favorites yet"
          body="Browse Discover and tap the ♥ on any talent to save them here."
          actions={
            <Link
              href={`/${tenantSlug}/client/discover`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 36,
                padding: "0 14px",
                borderRadius: 9,
                background: "#1D4ED8",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                letterSpacing: -0.1,
              }}
            >
              Browse Discover →
            </Link>
          }
        />
      )}
    </div>
  );
}
