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
import { NextResponse, after, type NextRequest } from "next/server";

import { getPublicHostContext } from "@/lib/saas/scope";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import {
  type ScanRecord,
  classifyDevice,
  findLinkByCodeAnyStatus,
  readCountry,
  recordScan,
  scanSessionKey,
} from "@/lib/links/link-store";
import { resolveDestinationUrl, resolveTarget, zonedNowIn } from "@/lib/links/resolve-target";

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
  // A WAY ONWARD, which production QA showed was the real defect here.
  // A guest standing at a table who scanned a retired code previously got a
  // dead end: an honest sentence and nowhere to go. The honest sentence is
  // still the point — sending them to the homepage as if the code had worked
  // would be worse — but it costs nothing to let them reach the site
  // deliberately, and it is the difference between "retired" and "broken".
  const onward = wantsSpanish ? "Ir al sitio" : "Go to the site";

  return new NextResponse(
    `<!doctype html><html lang="${wantsSpanish ? "es" : "en"}"><head>` +
      `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>${title}</title></head>` +
      `<body style="margin:0;display:grid;place-items:center;min-height:100vh;` +
      `font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#1a1e22;background:#f5f7f4">` +
      `<main style="max-width:24rem;padding:1.5rem;text-align:center">` +
      `<h1 style="font-size:1.25rem;margin:0 0 .5rem">${title}</h1>` +
      `<p style="margin:0 0 1.5rem;color:#4e5a63">${body}</p>` +
      `<a href="/" style="display:inline-block;padding:.6rem 1.2rem;border-radius:999px;` +
      `background:#1a1e22;color:#fff;text-decoration:none;font-size:.875rem">${onward}</a>` +
      `</main></body></html>`,
    {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

/**
 * Record a scan after the response is flushed.
 *
 * Deferred with `after()`, NOT fire-and-forget. A bare `void recordScan(...)`
 * is the obvious way to write this and it silently loses rows: a serverless
 * instance may freeze once the response is sent, and a floating promise dies
 * with it. Measured on production before this was fixed — three scans of one
 * code recorded TWO rows. Not zero, which is the dangerous part: a feature
 * that drops an unpredictable fraction looks like it works.
 *
 * `after()` keeps the instance alive for the work while the guest gets their
 * redirect immediately — a person standing at a table does not wait for
 * analytics. The inline fallback covers non-request contexts where `after()`
 * throws, matching `support-engine-emit.ts` and `scheduleWorkspaceAudit`.
 *
 * Shared by BOTH branches on purpose: a refusal is a scan, so the paused path
 * records through exactly the same guarantees as the resolved one. Two call
 * sites with their own copies of this would drift, and the paused one — being
 * rarer — is the copy that would silently lose the `after()`.
 */
function recordScanInBackground(scan: ScanRecord): void {
  const run = () => recordScan(scan).catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
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

  // Look the code up REGARDLESS of status. A paused link must still refuse the
  // guest AND record the scan: a refusal is a scan (CEO ruling 2026-09-05),
  // because an operator otherwise never learns a retired tent is still on a
  // table — which is exactly the moment they need to know.
  const link = await findLinkByCodeAnyStatus(host.tenantId, code);
  if (!link) return codeNotFound(request);

  if (link.status !== "active") {
    recordScanInBackground({
      linkId: link.id,
      tenantId: host.tenantId,
      outcome: "paused",
      resolvedTo: null,
      deviceClass: classifyDevice(request.headers.get("user-agent")),
      isNfc: request.nextUrl.searchParams.get("t") === NFC_MARKER,
      referrer: request.headers.get("referer"),
      country: readCountry(request.headers.get("x-vercel-ip-country")),
      sessionKey: scanSessionKey(clientIp(request), request.headers.get("user-agent")),
    });
    return codeNotFound(request);
  }

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

  // Refuse a destination that leaves this site. A guest scanning a code cannot
  // read where it points before they arrive, so a retargetable code is a
  // phishing primitive stapled to a table if this is not checked.
  const destination = resolveDestinationUrl(resolved.destination.to, request.url);
  if (!destination) return codeNotFound(request);

  // The link id rides on the destination so the draft order, inquiry or
  // admission created next can attribute itself (Q4). Only the ID travels: the
  // context stays on the row this server owns, so there is nothing in the URL
  // for a guest to edit into a different table or a promo they were not given.
  destination.searchParams.set("l", link.id);

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("cache-control", "no-store");

  recordScanInBackground({
    linkId: link.id,
    tenantId: host.tenantId,
    outcome: "resolved",
    resolvedTo: resolved.destination.label,
    deviceClass: classifyDevice(request.headers.get("user-agent")),
    isNfc: request.nextUrl.searchParams.get("t") === NFC_MARKER,
    referrer: request.headers.get("referer"),
    country: readCountry(request.headers.get("x-vercel-ip-country")),
    sessionKey: scanSessionKey(clientIp(request), request.headers.get("user-agent")),
  });

  return response;
}
