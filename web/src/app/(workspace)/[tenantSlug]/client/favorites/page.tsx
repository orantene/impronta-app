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
import { createTranslator } from "@/i18n/messages";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext } from "@/lib/impersonation/effective-read";
import { loadFavoritesPageData } from "./load-favorites-page";
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
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // TUL-254: favourites of the EFFECTIVE user. The context comes only from the
  // verified impersonation helper; a throw means "not acting".
  const readCtx = effectiveReadContext(
    session.user.id,
    await resolveDashboardIdentity().catch(() => null),
  );
  const [pageData, cardDesign] = await Promise.all([
    loadFavoritesPageData(session.user.id, scope.tenantId, readCtx),
    loadClientCardDesign(scope.tenantId),
  ]);
  if (!pageData) notFound();
  const { favorites } = pageData;

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow={t("dashboard.clientNav.favorites")}
        title={t("client.favorites.title")}
        subtitle={t("client.favorites.subtitle")}
        badge={favorites.length > 0 ? <HeaderBadge>{favorites.length}</HeaderBadge> : undefined}
      />

      {favorites.length > 0 ? (
        <FavoritesShell favorites={favorites} tenantSlug={tenantSlug} cardDesign={cardDesign} locale={locale} />
      ) : (
        <EmptyState
          icon="♡"
          title={t("client.favorites.emptyTitle")}
          body={t("client.favorites.emptyBody")}
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
              {t("dashboard.clientConfirm.favoritesEmptyCta")} →
            </Link>
          }
        />
      )}
    </div>
  );
}
