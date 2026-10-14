import type { NextRequest, NextResponse } from "next/server";

import { duplicateAuthCookieNames, nonCanonicalAuthCookieExpiryHeaders } from "./cookie-domain";

/**
 * TUL-621: when the browser sends the same Supabase auth cookie twice (held at
 * two scopes, e.g. host-only or `.staging.tulala.digital` beside the canonical
 * `.tulala.digital`), the server may read an older account. Sign-in always
 * writes the canonical scope, so every OTHER scope is expired.
 *
 * Applied once, to the FINAL proxy response, so it covers every branch:
 * updateSession passthroughs, rewrites (which copy cookies by name and would
 * drop raw headers), redirects and talent-site host responses (which never
 * run updateSession). Raw headers are appended last because a later
 * `response.cookies.set()` re-serializes Set-Cookie from a name-keyed map and
 * would collapse same-name headers.
 *
 * Host comes from the `host` header (the same value proxy.ts resolves the
 * host context from); a forged host can only target cookies the browser sends
 * for the real host, and custom / Desk / localhost hosts have no canonical
 * parent so nothing is written.
 */
export function appendAuthScopeSweep(request: NextRequest, response: NextResponse): NextResponse {
  const headers = nonCanonicalAuthCookieExpiryHeaders(
    duplicateAuthCookieNames(request.headers.get("cookie")),
    request.headers.get("host"),
  );
  for (const h of headers) response.headers.append("set-cookie", h);
  if (headers.length > 0) response.headers.set("cache-control", "private, no-store");
  return response;
}

export function withAuthScopeSweep(
  handler: (request: NextRequest) => Promise<NextResponse>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => appendAuthScopeSweep(request, await handler(request));
}
