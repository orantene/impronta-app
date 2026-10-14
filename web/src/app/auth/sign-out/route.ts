import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { signOutRedirectPath } from "@/lib/auth/sign-out-redirect";
import { guestCookieExpiryHeader } from "@/lib/guest-cookie";
import { authCookieExpiryHeaders } from "@/lib/supabase/cookie-domain";

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

function expiredRedirect(request: Request, names: string[]) {
  const host =
    request.headers.get("x-impronta-host-name") ?? request.headers.get("host");
  const res = NextResponse.redirect(
    new URL(signOutRedirectPath(request.headers.get("referer"), request.url), request.url),
    303,
  );
  for (const h of authCookieExpiryHeaders(names, host)) {
    res.headers.append("set-cookie", h);
  }
  // TUL-401: the guest thread cookie outlives the auth session unless expired here.
  res.headers.append("set-cookie", guestCookieExpiryHeader());
  res.headers.set("cache-control", "no-store");
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
  return expiredRedirect(request, cookiePairs(request).map((p) => p.name));
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const pairs = cookiePairs(request);

  if (url && key) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: { getAll: () => pairs, setAll: () => {} },
      });
      await supabase.auth.signOut();
    } catch {
      // Revocation is best effort; the cookies are expired below regardless.
    }
  }

  return expiredRedirect(
    request,
    pairs.map((p) => p.name),
  );
}
