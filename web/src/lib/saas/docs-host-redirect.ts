/**
 * docs.tulala.digital → tulala.digital/help (TUL-1393).
 *
 * The docs host is reserved for developer docs later; until then every path on
 * it hops to the help center (308). The host header is compared exactly
 * (case-insensitive, port ignored), so no other host is ever redirected. Runs
 * in the proxy BEFORE host resolution, so it does not depend on the host being
 * registered in `agency_domains`. Safe methods only: a POST/PUT would lose its
 * body on a 308 with some clients, so those get a 421 instead (same as www).
 */
import { NextResponse } from "next/server";

import { developerDocsEnabled } from "@/lib/developer-docs/flag";
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";

export const TULALA_DOCS_HOST = `docs.${TULALA_APEX_HOST}` as const;
export const DOCS_HOST_REDIRECT_TARGET = `https://${TULALA_APEX_HOST}/help` as const;

export type DocsHostRedirect =
  | { kind: "redirect"; location: string }
  | { kind: "wrong_method" }
  | null;

export function docsHostRedirect(hostHeader: string | null | undefined, method: string): DocsHostRedirect {
  const host = (hostHeader ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  if (host !== TULALA_DOCS_HOST) return null;
  if (method !== "GET" && method !== "HEAD") return { kind: "wrong_method" };
  return { kind: "redirect", location: DOCS_HOST_REDIRECT_TARGET };
}

/**
 * The proxy-ready response for the docs host, or null for any other host. Lives
 * here so proxy.ts only carries a two-line call (it is capped at 800 lines), and
 * the call sits inside `proxyInner`, so the auth-scope sweep wraps it like every
 * other response.
 */
export function docsHostResponse(
  hostHeader: string | null | undefined,
  method: string,
  requestUrl?: URL,
  env: Record<string, string | undefined> = process.env,
): NextResponse | null {
  const hop = docsHostRedirect(hostHeader, method);
  if (!hop) return null;
  // TUL-1401: flag ON serves the developer docs on this host instead of the /help hop. The rewrite
  // is final (no re-entry through the surface gate), so /developers is never admitted on other hosts.
  if (developerDocsEnabled(env) && requestUrl) {
    if (hop.kind === "wrong_method") return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    return NextResponse.rewrite(new URL(docsRewritePath(requestUrl.pathname), requestUrl));
  }
  if (hop.kind === "redirect") return NextResponse.redirect(hop.location, 308);
  return new NextResponse("Misdirected request: use tulala.digital for this method.", {
    status: 421,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** `/` -> `/developers`, `/auth` -> `/developers/auth`; an already-prefixed path is kept. */
export function docsRewritePath(pathname: string): string {
  if (pathname === "/developers" || pathname.startsWith("/developers/")) return pathname;
  return pathname === "/" ? "/developers" : `/developers${pathname}`;
}
