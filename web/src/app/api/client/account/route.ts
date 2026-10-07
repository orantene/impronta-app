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

export async function GET(req: Request) {
  if (!(await accountSurfaceEnabledForRequest())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") === "es" ? "es" : "en";
  const session = await getCachedActorSession();
  const user = session.user;
  const headersOut = { "cache-control": "private, no-store" };
  if (!user) return NextResponse.json({ signedIn: false }, { headers: headersOut });
  if (!isClientAccountEligible(session.profile?.app_role)) {
    return NextResponse.json({ signedIn: false, signedInAs: "business" }, { headers: headersOut });
  }
  const tenant = await resolveAccountTenant();
  const summary = tenant
    ? await loadClientAccountSummary({ userId: user.id, tenantId: tenant.tenantId, timeZone: tenant.timeZone, locale })
    : { nextVisit: null, unread: 0, balanceDue: null };
  return NextResponse.json(
    {
      signedIn: true,
      email: user.email ?? null,
      initials: accountInitials((session.profile as { display_name?: string | null } | null)?.display_name, user.email),
      summary,
    },
    { headers: headersOut },
  );
}
