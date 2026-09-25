import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextRes } from "next/server";

import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TALENT_PROFILE_HEADER,
  HOST_TENANT_SLUG_HEADER,
  resolveTenantContext,
} from "@/lib/saas/host-context";
import { attachTalentSiteGuestIdentity } from "@/lib/saas/talent-site-guest-identity";
import { PUBLIC_PATH_PREFIX_HEADER, TENANT_HEADER_NAME } from "@/lib/saas/scope";

/**
 * Second-pass response for the internal `/_talent-site` rewrite destination.
 *
 * Next re-invokes proxy on the rewrite path. The first pass sets talent headers,
 * but an early short-circuit that forwarded only a stripped inbound clone wiped
 * `x-impronta-host-context` / `x-impronta-talent-profile` and 404ed every vanity
 * host (D-MSG-431). Re-resolve from the proxy-written host name (or Host) and
 * re-bind; never trust client-supplied talent headers alone.
 *
 * Also re-attach guest identity (D-MSG-422): a plain `next()` would replace the
 * first-pass rewrite response and drop Set-Cookie / `x-impronta-guest`.
 */
export async function talentSiteRewriteReentryResponse(
  request: NextRequest,
  sanitizedInboundHeaders: Headers,
): Promise<NextResponse> {
  const rebound = new Headers(sanitizedInboundHeaders);
  const candidateHost =
    (request.headers.get(HOST_NAME_HEADER) ?? "").trim() ||
    (request.headers.get("host") ?? "").split(":")[0]?.trim() ||
    "";
  let reboundTalentSite = false;
  if (candidateHost) {
    const reboundCtx = await resolveTenantContext(request, candidateHost);
    if (reboundCtx.kind === "talent_site") {
      reboundTalentSite = true;
      rebound.set(HOST_CONTEXT_HEADER, "talent_site");
      rebound.set(HOST_NAME_HEADER, reboundCtx.hostname);
      rebound.set(HOST_TALENT_PROFILE_HEADER, reboundCtx.talentProfileId);
      rebound.delete(TENANT_HEADER_NAME);
      rebound.delete(HOST_TENANT_SLUG_HEADER);
      rebound.delete(PUBLIC_PATH_PREFIX_HEADER);
    }
  }
  if (reboundTalentSite) {
    const attachGuest = attachTalentSiteGuestIdentity(request, rebound);
    return attachGuest(NextRes.next({ request: { headers: rebound } }));
  }
  return NextRes.next({ request: { headers: rebound } });
}
