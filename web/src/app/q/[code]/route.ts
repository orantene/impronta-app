/**
 * QR & Links Q1 — `/q/<code>`, where every printed code lands.
 *
 * A route handler rather than a page: the answer to a scan is a redirect, and
 * rendering a page first would cost a guest at a table a round trip and a flash
 * of blank screen before the thing they wanted.
 *
 * THE HOST IS THE TENANT
 * The tenant comes from the resolved host, never from the URL and never from
 * anything the caller sent. `casarizo.com/q/t7` and `otherplace.com/q/t7` are
 * two different links that happen to share a code, which is why the unique
 * index is on `(tenant_id, lower(code))` and why this handler refuses outright
 * on a host with no tenant.
 *
 * WHY THIS PATH ALSO HAD TO BE ADDED TO THE SURFACE ALLOW-LIST
 * `lib/saas/surface-allow-list.ts` runs inside the proxy and rewrites any path
 * it does not recognise to a 404 BEFORE Next routing happens. A correct route
 * file at a correct path still 404s without an entry there, and the symptom
 * looks like a routing bug rather than an allow-list one. See `/q` in that file.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getPublicHostContext } from "@/lib/saas/scope";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import {
  classifyDevice,
  findActiveLinkByCode,
  readCountry,
  recordScan,
  scanSessionKey,
} from "@/lib/links/link-store";
import { resolveTarget, zonedNowIn } from "@/lib/links/resolve-target";

export const dynamic = "force-dynamic";

/**
 * An NFC tag carries the same URL as the printed code, with one marker so the
 * scan can be told apart from a camera scan. `?t=nfc` is the whole protocol —
 * it is not a claim about anything the guest gets, only a label on the row, so
 * there is nothing to gain by forging it.
 */
const NFC_MARKER = "nfc";

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

/**
 * What a guest sees when a code does not resolve.
 *
 * A real 404 with a plain body, NOT a redirect to somewhere plausible. A guest
 * who scanned a dead sticker acts on whatever they are shown, so sending them
 * to the homepage would be this codebase's "function that answers instead of
 * refusing" wearing a friendly face: they would think they had seen the menu.
 *
 * Deliberately NOT `NextResponse.rewrite`. `rewrite` is a middleware API — it
 * works by setting a header the proxy consumes — and in a Route Handler it
 * produces a 404 with an empty body and no page. Next's `notFound()` is a page
 * API and is unavailable here for the same reason. So the handler renders the
 * refusal itself: two sentences, EN and ES, no chrome.
 *
 * Q2 replaces this with a designed page carrying the tenant's branding and a
 * way back to the site. Until then this is the honest minimum, and it is a real
 * 404 to a crawler.
 */
function codeNotFound(request: NextRequest): NextResponse {
  const wantsSpanish = (request.headers.get("accept-language") ?? "")
    .toLowerCase()
    .startsWith("es");

  const title = wantsSpanish ? "Este código no está activo" : "This code is not active";
  const body = wantsSpanish
    ? "Puede que se haya pausado o reemplazado. Pregunta al personal."
    : "It may have been paused or replaced. Ask a member of staff.";

  return new NextResponse(
    `<!doctype html><html lang="${wantsSpanish ? "es" : "en"}"><head>` +
      `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>${title}</title></head>` +
      `<body style="margin:0;display:grid;place-items:center;min-height:100vh;` +
      `font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#1a1e22;background:#f5f7f4">` +
      `<main style="max-width:24rem;padding:1.5rem;text-align:center">` +
      `<h1 style="font-size:1.25rem;margin:0 0 .5rem">${title}</h1>` +
      `<p style="margin:0;color:#4e5a63">${body}</p>` +
      `</main></body></html>`,
    {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const host = await getPublicHostContext();

  // Only hosts that carry a tenant can resolve a code. On the app and marketing
  // hosts a link has no owner to look it up under; platform-level links (a
  // talent comp card on tulala.digital) are Q5 and will resolve against the
  // profile's own tenant rather than by inventing a platform tenant here.
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) {
    return codeNotFound(request);
  }

  const link = await findActiveLinkByCode(host.tenantId, code);
  if (!link) return codeNotFound(request);

  // The wall clock in the VENUE's timezone. `resolveTenantTimezone` is the one
  // timezone read path in this codebase; a second one is a bug, and the reason
  // is that four features each invented their own UTC default and nobody could
  // say which one a given message had used.
  const { timezone } = await resolveTenantTimezone(host.tenantId);
  const now = zonedNowIn(new Date(), timezone);

  // Q1 resolves the rules that need no world facts. `eventTonight` is left
  // undefined rather than guessed, which the resolver treats as "we did not
  // find out" and falls through to the default — never as "nothing is on".
  // Events & Ticketing supplies the fact in Q4; until then a door code with
  // event rules answers with its default, which is honest and still useful.
  const resolved = resolveTarget(link.targets, now, {});

  if (!resolved.ok) {
    // Reaching here means a link was stored without a reachable default, which
    // both a database constraint and the save-time validator exist to prevent.
    // It is a broken link, not a broken guest, so it 404s and says so loudly
    // rather than sending them somewhere invented.
    return codeNotFound(request);
  }

  const destination = new URL(resolved.destination.to, request.url);

  // The link id rides on the destination so the draft order, inquiry or
  // admission created next can attribute itself (Q4). Only the ID travels: the
  // context stays on the row this server owns, so there is nothing in the URL
  // for a guest to edit into a different table or a promo they were not given.
  destination.searchParams.set("l", link.id);

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("cache-control", "no-store");

  // Fire and forget. A guest standing at a table does not wait for analytics,
  // and a failed insert must not cost them their menu. `recordScan` swallows
  // and logs its own errors; the catch here is for the promise itself.
  void recordScan({
    linkId: link.id,
    tenantId: host.tenantId,
    deviceClass: classifyDevice(request.headers.get("user-agent")),
    isNfc: request.nextUrl.searchParams.get("t") === NFC_MARKER,
    referrer: request.headers.get("referer"),
    country: readCountry(request.headers.get("x-vercel-ip-country")),
    sessionKey: scanSessionKey(clientIp(request), request.headers.get("user-agent")),
    resolvedTo: resolved.destination.label,
  }).catch(() => {});

  return response;
}
