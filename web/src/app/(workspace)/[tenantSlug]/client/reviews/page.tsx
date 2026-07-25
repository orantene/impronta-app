// W8 — Client Reviews page.
// Two-sided review surface for the client: reviews about them (talent → client)
// and reviews they've written (client → talent). Mirrors the sibling Bookings
// page shell (session + tenant scope + ClientPageHeader).

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { tenantReviewsEnabled } from "@/lib/reviews/reviews-entitlement";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientReviews,
  loadClientRatingSummary,
  loadReviewsAuthoredByUser,
} from "@/lib/reviews/load-reviews";
import { loadClientSelfProfile, loadWorkspaceRosterLite } from "../../_data-bridge";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import {
  ClientReviewsPanel,
  type GivenReview,
} from "../_components/ClientReviewsPanel";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function ClientReviewsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  // Reviews are a PREMIUM capability, gated on the SURFACE tenant's entitlement.
  // A non-entitled workspace gets a plain empty state (same ClientPageHeader
  // shell) instead of the reviews panel. Fails closed via tenantReviewsEnabled.
  const reviewsEnabled = await tenantReviewsEnabled(scope.tenantId);
  if (!reviewsEnabled) {
    return (
      <div style={{ fontFamily: FONT }}>
        <ClientPageHeader
          eyebrow={t("dashboard.clientNav.reviews")}
          title={t("dashboard.clientNav.reviews")}
          subtitle={t("client.reviews.notEnabled")}
        />
      </div>
    );
  }

  const [received, receivedSummary, authored, roster] = await Promise.all([
    loadClientReviews(session.user.id),
    loadClientRatingSummary(session.user.id),
    loadReviewsAuthoredByUser(session.user.id),
    loadWorkspaceRosterLite(scope.tenantId),
  ]);

  // Resolve talent-profile IDs to display names for the "reviews you've written"
  // list. The roster carries { id, name } where id is the talent_profile id.
  const talentNames = new Map(roster.map((r) => [r.id, r.name]));
  const given: GivenReview[] = authored.map((r) => ({
    id: r.id,
    talentName: talentNames.get(r.talentProfileId) ?? null,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt,
  }));

  const receivedCount = receivedSummary.count;

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow={t("dashboard.clientNav.reviews")}
        title={t("dashboard.clientNav.reviews")}
        subtitle={
          receivedCount === 0 && given.length === 0
            ? t("client.reviews.pageEmptySubtitle")
            : interpolate(t("client.reviews.pageCountsSubtitle"), {
                received: receivedCount,
                written: given.length,
              })
        }
        badge={
          receivedCount > 0 ? (
            <HeaderBadge tone="success">
              {interpolate(t("client.reviews.avgBadge"), {
                value: receivedSummary.average.toFixed(1),
              })}
            </HeaderBadge>
          ) : undefined
        }
      />

      <ClientReviewsPanel
        received={received}
        receivedSummary={receivedSummary}
        given={given}
      />
    </div>
  );
}
