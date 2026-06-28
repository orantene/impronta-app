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
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../_data-bridge";
import { loadClientShortlistsForUser } from "../../_data-bridge/discover";
import { loadClientCardDesign } from "../_data-bridge/load-card-design";
import { loadClientSubscription, canUsePro } from "@/lib/discover/client-subscription";
import { ShortlistsShell } from "./ShortlistsShell";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { EmptyState } from "../_components/EmptyState";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';

export default async function ClientShortlistsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [shortlists, subscription, cardDesign] = await Promise.all([
    loadClientShortlistsForUser(session.user.id),
    loadClientSubscription(session.user.id),
    loadClientCardDesign(scope.tenantId),
  ]);
  const hasPro = canUsePro(subscription);

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Shortlists"
        title="Your shortlists"
        subtitle="Named groups of talent you saved on Discover. Send one inquiry from a shortlist and it routes to the right agency for each talent."
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
          title="No shortlists yet"
          body="Build a shortlist by browsing Discover and adding talent. Then send one inquiry that fans out to the right agency for each talent."
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
