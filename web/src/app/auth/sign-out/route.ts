import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
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
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const pairs = (request.headers.get("cookie") ?? "")
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

  const host =
    request.headers.get("x-impronta-host-name") ?? request.headers.get("host");
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  for (const h of authCookieExpiryHeaders(
    pairs.map((p) => p.name),
    host,
  )) {
    res.headers.append("set-cookie", h);
  }
  // TUL-401: the guest thread cookie outlives the auth session unless expired here.
  res.headers.append("set-cookie", guestCookieExpiryHeader());
  res.headers.set("cache-control", "no-store");
  return res;
}
