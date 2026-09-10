import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Send a canonical destination segment to the route that renders it today.
 *
 * WHY THIS EXISTS. `lib/workspace/destinations.ts` names the segment each
 * destination is MOVING to. Several of those names are not routes yet, and
 * three of them belong to destinations that render as real server pages:
 * `spaces` (live at /admin/tables), `issues` (/admin/exceptions) and the
 * unbuilt `payments` (/admin/financials). The SPA-bodied ones can stand up a
 * `PageRouteSyncer` and be done; these cannot — the body is a different route's
 * server component, and a syncer at the new segment would render `null` under
 * an empty shell. So the new URL redirects to the live one instead of 404ing or
 * painting a blank screen, and the redirect goes away when the route moves.
 *
 * HOST SHAPE. Mirrors the admin layout: `x-impronta-original-pathname` is the
 * BROWSER-facing path, set by middleware before its branded rewrite, so on a
 * custom domain it reads `/admin/spaces` and on the shared app host
 * `/impronta/admin/spaces`. Building the target from the slug unconditionally
 * would hand a branded-host user `improntamodels.com/impronta/admin/tables`.
 */
export async function redirectToLiveAdminSegment(
  tenantSlug: string,
  segment: string,
): Promise<never> {
  const hdrs = await headers();
  const slugPrefix = `/${tenantSlug}`;
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `${slugPrefix}/admin`;
  const brandedHost = !(pathname === slugPrefix || pathname.startsWith(`${slugPrefix}/`));
  const base = brandedHost ? "/admin" : `${slugPrefix}/admin`;
  redirect(segment ? `${base}/${segment}` : base);
}
