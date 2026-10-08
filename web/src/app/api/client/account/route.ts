// Client account popover state for talent sites: who is signed in (initials)
// and the tenant-scoped summary card. Flag-gated: with CLIENT_ACCOUNT_HOSTS
// not listing `talent` this answers 404 and reveals nothing.
//
// Reachability: `/api/client` is in APP_API_PREFIXES (path-groups.ts) and every
// `/api/` path passes through on talent_site hosts.

import { NextResponse } from "next/server";

import { accountInitials, isClientAccountEligible } from "@/lib/client-account/pure";
import { loadClientAccountSummary } from "@/lib/client-account/summary.server";
import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "@/lib/client-account/tenant.server";
import { getCachedActorSession } from "@/lib/server/request-cache";

export const dynamic = "force-dynamic";

// Every response, success or not, is per-visitor: never stored by a CDN or browser cache.
const NO_STORE = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

// The user is the session user and the tenant is host-resolved. The query
// string is read for ONE cosmetic value (locale, whitelisted to en/es) only.
export async function GET(req: Request) {
  try {
    if (!(await accountSurfaceEnabledForRequest())) return reply({ error: "not_found" }, 404);
    const locale = new URL(req.url).searchParams.get("locale") === "es" ? "es" : "en";
    return await respond(locale);
  } catch {
    return reply({ error: "unavailable" }, 500);
  }
}

async function respond(locale: "en" | "es") {
  const session = await getCachedActorSession();
  const user = session.user;
  if (!user) return reply({ signedIn: false });
  if (!isClientAccountEligible(session.profile?.app_role)) return reply({ signedIn: false, signedInAs: "business" });
  const tenant = await resolveAccountTenant();
  const summary = tenant
    ? await loadClientAccountSummary({ userId: user.id, tenantId: tenant.tenantId, timeZone: tenant.timeZone, locale })
    : { nextVisit: null, unread: 0, balanceDue: null };
  return reply({
    signedIn: true,
    email: user.email ?? null,
    initials: accountInitials((session.profile as { display_name?: string | null } | null)?.display_name, user.email),
    summary,
  });
}
