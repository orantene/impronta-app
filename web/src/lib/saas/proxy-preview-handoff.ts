import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_COOKIE_OPTIONS,
  PREVIEW_QUERY_PARAM,
  previewCookieNameFor,
} from "@/lib/site-admin/preview/cookie";
import { readPreviewFromQueryParam } from "@/lib/site-admin/preview/middleware";

/**
 * Preview handoff (moved verbatim out of `src/proxy.ts`). Admin iframes the
 * storefront with `?preview=<jwt>`. On the first hit we verify the token, set a
 * tenant-scoped HttpOnly cookie, and 302-redirect to the same URL with the
 * param stripped. Subsequent loads within the iframe are cookie-driven so the
 * JWT never touches browser history or server access logs past the entry.
 * The caller has already checked the host is agency/hub and the param is present.
 */
export async function previewHandoffResponse(
  request: NextRequest,
  tenantId: string,
): Promise<NextResponse> {
  const previewResult = await readPreviewFromQueryParam(request, tenantId);
  if (previewResult.ok) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete(PREVIEW_QUERY_PARAM);
    const res = NextResponse.redirect(clean, 302);
    res.cookies.set(previewCookieNameFor(tenantId), previewResult.token, { ...PREVIEW_COOKIE_OPTIONS });
    return res;
  }
  // Invalid / expired / wrong-tenant token: strip the param silently and
  // proceed as a normal published request. No error UI here — the panel
  // will mint a fresh token on the next cycle.
  const clean = request.nextUrl.clone();
  clean.searchParams.delete(PREVIEW_QUERY_PARAM);
  return NextResponse.redirect(clean, 302);
}
