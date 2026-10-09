// D5 slice 2 — client shortlists viewer.
//
// Lists the signed-in client's named shortlists. Each shortlist row
// shows talents + a "Send inquiry" CTA that hits POST /api/discover/inquiry
// with the full talent array — server-side fans out per primary tenant
// (D5 slice 1 logic) so one shortlist can spawn N inquiries when talents
// span multiple agencies.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { clientPageReadCtx } from "../_data-bridge/client-read-ctx";
import { loadShortlistsPageData } from "../_data-bridge/client-page-loaders";
import { loadClientCardDesign } from "../_data-bridge/load-card-design";
import { canUsePro } from "@/lib/discover/client-subscription";
import { ShortlistsShell } from "./ShortlistsShell";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { EmptyState } from "../_components/EmptyState";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function ClientShortlistsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const [pageData, cardDesign] = await Promise.all([
    loadShortlistsPageData(session.user.id, scope.tenantId, await clientPageReadCtx(session.user.id)),
    loadClientCardDesign(scope.tenantId),
  ]);
  if (!pageData) notFound();
  const { shortlists, subscription } = pageData;
  const hasPro = canUsePro(subscription);

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow={t("client.shortlists.eyebrow")}
        title={t("client.shortlists.title")}
        subtitle={t("client.shortlists.subtitle")}
        badge={shortlists.length > 0 ? <HeaderBadge>{shortlists.length}</HeaderBadge> : undefined}
      />

      {shortlists.length > 0 ? (
        <ShortlistsShell
          shortlists={shortlists}
          tenantSlug={tenantSlug}
          tier={subscription.tier}
          hasPro={hasPro}
          cardDesign={cardDesign}
          locale={locale}
        />
      ) : (
        <EmptyState
          icon="📑"
          title={t("client.shortlists.emptyTitle")}
          body={t("client.shortlists.emptyBody")}
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
