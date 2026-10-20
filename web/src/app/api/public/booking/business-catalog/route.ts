/**
 * GET /api/public/booking/business-catalog[?limit=50&offset=0]
 *
 * F3: a business's public services as JSON, for AI assistants and other sites.
 * Read-only. Only GUEST-SELLABLE services (D-10: published, approved, public);
 * a quote service states no figure (D-10a). The business is the workspace the
 * HOST belongs to (an agency or hub host); any other host answers 404.
 *
 * Rate limited per client IP in its OWN bucket (30 per minute), separate from the
 * slot lookups. Cross-origin readable (CORS `*`, GET and OPTIONS) because it is
 * public, read-only data meant for other sites and assistants.
 *
 * The language comes from `?lang=` ONLY (default es), never from cookies or
 * Accept-Language, so a cached response can never be served in another language.
 * Services that are on request are intentionally NOT listed: this API is the
 * bookable-only catalog.
 *
 * TUL-1320: the shared HUB host (one tenant for every talent on the network)
 * lists nothing by tenant alone; it needs `?talent=<public profile code>` naming
 * a public, listed, non-deleted profile. Ticketed-event and reservation rows are
 * never listed.
 * Lives under /api/public/booking so the surface allow-list already reaches it.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { aiReadVerdictForRequest } from "@/lib/seo/ai-bot-gate.server";
import { aiAccessJson, resolveAiAccess } from "@/lib/offerings/ai-access";
import { pageOf, parseCatalogPaging, toBusinessCatalogServices } from "@/lib/offerings/business-catalog";
import { loadBusinessCatalogOfferings } from "@/lib/offerings/business-catalog.server";
import { checkPublicCatalog } from "@/lib/rate-limit-kv";
import { getPublicHostContext } from "@/lib/saas/scope";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import { logServerError } from "@/lib/server/safe-error";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

/** `?lang=en|es`; anything else is Spanish, the platform default. */
function langOf(url: URL): "en" | "es" {
  return url.searchParams.get("lang")?.trim().toLowerCase() === "en" ? "en" : "es";
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const limited = await checkPublicCatalog(resolvePublicClientIp(await headers()));
  if (!limited.ok) {
    const retryAfter = Math.max(1, Math.ceil((limited.retryAfterMs ?? 1000) / 1000));
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...CORS, "Retry-After": String(retryAfter) } });
  }
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503, headers: CORS });

  try {
    const url = new URL(request.url);
    const paging = parseCatalogPaging(url.searchParams);
    const locale = langOf(url);
    const hostKind = host.kind;
    const [loaded, identity] = await Promise.all([
      loadBusinessCatalogOfferings(admin, {
        tenantId: host.tenantId,
        hostKind,
        profileCode: url.searchParams.get("talent"),
        locale,
      }),
      // The hub is a network, not one business: it has no single name to give.
      hostKind === "hub" ? Promise.resolve(null) : loadPublicIdentity(host.tenantId).catch(() => null),
    ]);
    // TUL-1320: the shared hub host never lists by tenant alone.
    if (loaded.kind === "talent_required") {
      return NextResponse.json(
        { error: "talent_required", hint: "On this host pass ?talent=<public profile code>." },
        { status: 400, headers: CORS },
      );
    }
    if (loaded.kind === "profile_not_public") return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
    if (loaded.kind === "unavailable") return NextResponse.json({ error: "service_unavailable" }, { status: 503, headers: CORS });
    // TUL-1326 one toggle: an AI bot is refused (no data) while this site's "IA puede leer
    // mi sitio" switch is OFF or unreadable. Hub: the talent's switch; agency: the workspace's.
    const verdict = await aiReadVerdictForRequest(
      admin,
      request,
      loaded.talentProfileId ? { talentProfileId: loaded.talentProfileId } : { tenantId: host.tenantId },
    );
    if (verdict === "refuse") {
      return NextResponse.json(
        { error: "ai_access_off" },
        { status: 403, headers: { ...CORS, "Cache-Control": "no-store", Vary: "User-Agent" } },
      );
    }
    const all = toBusinessCatalogServices(loaded.offerings, locale);
    const page = pageOf(all, paging);
    return NextResponse.json(
      {
        business: identity?.public_name?.trim() || null,
        site: url.origin,
        ...(loaded.talentCode ? { talent: loaded.talentCode } : {}),
        total: all.length,
        offset: paging.offset,
        next_offset: page.next_offset,
        services: page.items,
        ai: aiAccessJson(resolveAiAccess({ subject: "business" })),
      },
      // No shared (CDN) caching: the answer depends on the User-Agent, and a cached 200
      // must never be served to an AI bot the switch refuses.
      { headers: { ...CORS, "Cache-Control": "public, max-age=60", Vary: "User-Agent" } },
    );
  } catch (err) {
    logServerError("api.public.booking.businessCatalog", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500, headers: CORS });
  }
}
