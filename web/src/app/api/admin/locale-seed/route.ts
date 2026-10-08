// Workspace admin locale seed (TUL-117).
//
// The workspace admin layout redirects here once when the `locale` cookie is
// absent, auto-written, or owned by someone else, and the tenant has a stored
// default language. A server layout cannot write cookies, so this handler is
// the one place that does. It re-derives everything from the session (the
// query only carries the tenant slug and where to go back to), never
// overwrites a deliberate cookie the signed-in user owns, and writes the AUTO
// marker so a later change of the tenant default re-seeds. Twin of
// `/api/talent/locale-seed`; contract: `@/i18n/locale-cookies`.

import { NextResponse, type NextRequest } from "next/server";

import {
  LOCALE_COOKIE,
  localeCookieIsAutoWritten,
  stampLocaleOwner,
  seedTalentDashboardLocaleCookie,
} from "@/i18n/locale-middleware";
import { LOCALE_OWNER_COOKIE } from "@/i18n/locale-cookies";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadWorkspaceSeedPrimary } from "@/lib/site-admin/server/workspace-locale-seed.server";
import {
  safeWorkspaceNextPath,
  WORKSPACE_LOCALE_SEED_ATTEMPT_COOKIE,
  WORKSPACE_LOCALE_SEED_ATTEMPT_MAX_AGE_SECONDS,
  workspaceLocaleSeedPlan,
} from "@/lib/site-admin/server/workspace-locale-seed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const next = safeWorkspaceNextPath(request.nextUrl.searchParams.get("next"), slug);
  const res = NextResponse.redirect(new URL(next, request.nextUrl.origin), 307);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(WORKSPACE_LOCALE_SEED_ATTEMPT_COOKIE, "1", {
    path: "/",
    maxAge: WORKSPACE_LOCALE_SEED_ATTEMPT_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  // Not a membership check: the admin layout only hops here after its own
  // canView gate. This handler writes nothing but the CALLER'S own locale
  // cookie, from the tenant's public default language, so a signed-in user
  // naming another slug can at most set their own cookie to that language.
  const [session, scope] = await Promise.all([getCachedActorSession(), getTenantScopeBySlug(slug)]);
  if (!session.user || !scope) return res;

  const primary = await loadWorkspaceSeedPrimary(scope.tenantId);
  if (!primary) return res;
  const plan = workspaceLocaleSeedPlan({
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value ?? null,
    cookieIsAuto: localeCookieIsAutoWritten(request),
    cookieOwner: request.cookies.get(LOCALE_OWNER_COOKIE)?.value ?? null,
    userId: session.user.id,
    primary,
  });
  if (plan.locale) seedTalentDashboardLocaleCookie(res, plan.locale);
  if (plan.stamp) stampLocaleOwner(res, session.user.id);
  return res;
}
