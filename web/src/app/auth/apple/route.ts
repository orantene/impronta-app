import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAppleAuthProviderEnabled } from "@/lib/auth/apple-provider-flag";
import { normalizeNextPath } from "@/lib/auth-flow";
import { isSupportDeskHost } from "@/lib/support/desk-hosts";
import {
  cookieDomainForHost,
  expireParentDomainAuthCookies,
  isSupabaseAuthCookie,
} from "@/lib/supabase/cookie-domain";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-initiated Apple OAuth entry point (TUL-65 / Client Account P5).
 *
 * Mirrors `/auth/google`: the client opens a popup here so PKCE lives in
 * Set-Cookie and `window.open` stays synchronous on the click event.
 *
 * Gated by `AUTH_APPLE_PROVIDER_ENABLED` (server-side). Also requires the
 * Apple provider in the Supabase Auth dashboard before live sign-in works.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = normalizeNextPath(searchParams.get("next"));
  const popup = searchParams.get("popup") === "1";

  if (!isAppleAuthProviderEnabled()) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const cookieStore = await cookies();
  const requestHost =
    request.headers.get("x-impronta-host-name") ?? request.headers.get("host");
  const onDeskHost = isSupportDeskHost(requestHost);

  const authCookieDomain = cookieDomainForHost(requestHost);

  const cookieResponse = new NextResponse(null, { status: 200 });
  if (onDeskHost) {
    const authNames = cookieStore
      .getAll()
      .map((c) => c.name)
      .filter(isSupabaseAuthCookie);
    expireParentDomainAuthCookies(cookieResponse.cookies, authNames);
    expireParentDomainAuthCookies(cookieStore, authNames);
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const scoped =
            authCookieDomain && isSupabaseAuthCookie(name)
              ? { ...options, domain: authCookieDomain }
              : options;
          cookieStore.set(name, value, scoped);
          cookieResponse.cookies.set(name, value, scoped);
        });
      },
    },
  });

  const callbackUrl = new URL("/auth/callback", origin);
  if (popup) callbackUrl.searchParams.set("popup", "1");
  if (next && next !== "/") callbackUrl.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const redirect = NextResponse.redirect(data.url);
  cookieResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}
