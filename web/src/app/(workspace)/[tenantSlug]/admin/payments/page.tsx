/**
 * Payments — the registry's canonical segment, redirected to the route that
 * renders it today. Payments is NOT built. Financials is the richer of the two surfaces it will absorb, and is a real server page, so that is where a /payments URL lands.
 * See `_registry-route-redirect.ts` for why this is a redirect and not a
 * PageRouteSyncer stub.
 */
import { redirectToLiveAdminSegment } from "../_registry-route-redirect";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return redirectToLiveAdminSegment(tenantSlug, "financials");
}
