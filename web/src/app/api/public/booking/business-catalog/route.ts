/**
 * GET /api/public/booking/business-catalog[?limit=50&offset=0]
 *
 * F3: a business's public services as JSON, for AI assistants and other sites.
 * Read-only. Only GUEST-SELLABLE services (D-10: published, approved, public);
 * a quote service states no figure (D-10a). The business is the workspace the
 * HOST belongs to (an agency or hub host); any other host answers 404.
 *
 * Rate limited per client IP (the shared public-booking limiter, 60 per minute).
 * Lives under /api/public/booking so the surface allow-list already reaches it.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getRequestLocale } from "@/i18n/request-locale";
import { aiAccessJson, resolveAiAccess } from "@/lib/offerings/ai-access";
import { pageOf, parseCatalogPaging, toBusinessCatalogServices } from "@/lib/offerings/business-catalog";
import { loadBusinessCatalogOfferings } from "@/lib/offerings/business-catalog.server";
import { checkBookingSlots } from "@/lib/rate-limit-kv";
import { getPublicHostContext } from "@/lib/saas/scope";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import { logServerError } from "@/lib/server/safe-error";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await checkBookingSlots(resolvePublicClientIp(await headers()));
  if (!limited.ok) {
    const retryAfter = Math.max(1, Math.ceil((limited.retryAfterMs ?? 1000) / 1000));
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  try {
    const url = new URL(request.url);
    const paging = parseCatalogPaging(url.searchParams);
    const locale = await getRequestLocale();
    const [offerings, identity] = await Promise.all([
      loadBusinessCatalogOfferings(admin, host.tenantId, locale),
      loadPublicIdentity(host.tenantId).catch(() => null),
    ]);
    const all = toBusinessCatalogServices(offerings, locale);
    const page = pageOf(all, paging);
    return NextResponse.json(
      {
        business: identity?.public_name?.trim() || null,
        site: url.origin,
        total: all.length,
        offset: paging.offset,
        next_offset: page.next_offset,
        services: page.items,
        ai: aiAccessJson(resolveAiAccess({ subject: "business" })),
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch (err) {
    logServerError("api.public.booking.businessCatalog", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
