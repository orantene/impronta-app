import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { signOutRedirectPath } from "@/lib/auth/sign-out-redirect";
import { guestCookieExpiryHeader } from "@/lib/guest-cookie";
import { authCookieExpiryHeaders } from "@/lib/supabase/cookie-domain";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { signOutAuditEvent } from "@/lib/auth/sign-out-audit";
import { TENANT_HEADER_NAME } from "@/lib/saas/scope";

/**
 * POST /auth/sign-out — host-independent sign-out (TUL-120 C1-03).
 *
 * The `signOut` server action clears the cookie through a name-keyed jar, so
 * only ONE scope per cookie name is expired. On tulala.digital a legacy
 * host-only cookie shadowing the `.tulala.digital` one survived and the user
 * stayed signed in. This handler revokes the session server-side, then expires
 * every Supabase auth cookie at BOTH scopes with raw Set-Cookie headers.
 */
function cookiePairs(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return {
        name: i < 0 ? p : p.slice(0, i),
        value: i < 0 ? "" : p.slice(i + 1),
      };
    });
}

/**
 * S1: always include this project's own auth cookie base name, so every scope
 * and chunk is expired even when the request did not carry it (a copy at a
 * scope this request's host is not sent still gets its Domain expiry here).
 */
function projectAuthCookieName(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

// Takes the cookie PAIRS (not names) so any lookup in here (e.g. the locale
// cookie added on integ/now-batch2) has them in scope: no ReferenceError.
function expiredRedirect(request: Request, pairs: { name: string; value: string }[]) {
  const own = projectAuthCookieName();
  const requestNames = pairs.map((p) => p.name);
  const names = own ? [...requestNames, own] : requestNames;
  const host =
    request.headers.get("x-impronta-host-name") ?? request.headers.get("host");
  const res = NextResponse.redirect(
    new URL(
      signOutRedirectPath(
        request.headers.get("referer"),
        request.url,
        pairs.find((p) => p.name === "locale")?.value,
      ),
      request.url,
    ),
    303,
  );
  for (const h of authCookieExpiryHeaders(names, host)) {
    res.headers.append("set-cookie", h);
  }
  // TUL-401: the guest thread cookie outlives the auth session unless expired here.
  res.headers.append("set-cookie", guestCookieExpiryHeader());
  res.headers.set("cache-control", "private, no-store");
  res.headers.set("clear-site-data", '"cache"');
  return res;
}

/**
 * GET /auth/sign-out — final hop of the `signOut` server action (S1). The
 * action has already revoked the session; a server action cannot emit raw
 * Set-Cookie headers, so it redirects here to expire BOTH cookie scopes.
 * Cookie expiry only (no revocation), and refused for cross-site requests so
 * a third-party page cannot force a sign-out.
 */
export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }
  return expiredRedirect(request, cookiePairs(request));
}

export async function POST(request: Request) {
  // A third-party page must not be able to end the session.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const pairs = cookiePairs(request);

  if (url && key) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: { getAll: () => pairs, setAll: () => {} },
      });
      // TUL-616: audit the sign-out on an agency host (proxy-set tenant
      // header). The user is verified before the session is revoked; the
      // insert is fire-and-forget so it can never block or fail sign-out.
      const tenantId = request.headers.get(TENANT_HEADER_NAME);
      if (tenantId) {
        const { data, error } = await supabase.auth.getUser();
        const event = error ? null : signOutAuditEvent(tenantId, data.user);
        if (event) scheduleWorkspaceAudit(event);
      }
      // Revoke server-side so the refresh token can never re-mint a session.
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // Revocation is best effort; the cookies are expired below regardless.
    }
  }

  return expiredRedirect(request, pairs);
}
