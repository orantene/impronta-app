/**
 * Spaces — the registry's canonical segment, redirected to the route that
 * renders it today. Spaces is BUILT and renders as a real server page at /admin/tables.
 * See `_registry-route-redirect.ts` for why this is a redirect and not a
 * PageRouteSyncer stub.
 */
import { redirectToLiveAdminSegment } from "../_registry-route-redirect";

export const dynamic = "force-dynamic";

export default async function AdminSpacesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return redirectToLiveAdminSegment(tenantSlug, "tables");
}
