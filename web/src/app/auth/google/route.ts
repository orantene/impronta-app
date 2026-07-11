import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { normalizeNextPath } from "@/lib/auth-flow";
import {
  cookieDomainForHost,
  isSupabaseAuthCookie,
} from "@/lib/supabase/cookie-domain";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-initiated Google OAuth entry point.
 *
 * The client opens a popup to this URL instead of calling
 * supabase.auth.signInWithOAuth() client-side. Initiating server-side:
 *  - stores the PKCE code verifier via Set-Cookie (not document.cookie),
 *    which survives the cross-origin popup redirect chain reliably, and
 *  - lets the popup open synchronously on the click event — no async
 *    signInWithOAuth() call between click and window.open().
 *
 * Both advantages eliminate the root cause of the "bad_oauth_callback:
 * OAuth state parameter" error that appeared when using the browser-client
 * PKCE popup pattern.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = normalizeNextPath(searchParams.get("next"));
  const popup = searchParams.get("popup") === "1";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const cookieStore = await cookies();

  // Scope Supabase auth cookies — critically the PKCE `-code-verifier` written
  // by signInWithOAuth below — to the shared parent domain (".tulala.digital")
  // exactly like server.ts / client.ts / middleware.ts do. Without this the
  // verifier is written HOST-ONLY while every other client on the platform
  // reads/writes/expires it PARENT-DOMAIN scoped, producing two same-name
  // cookies at different scopes. The browser sends both to /auth/callback,
  // @supabase/ssr reads whichever comes first (often the stale one), and
  // exchangeCodeForSession fails PKCE verification → "Authentication failed".
  // `undefined` (localhost / custom domains) keeps the prior host-only default.
  const authCookieDomain = cookieDomainForHost(
    request.headers.get("x-impronta-host-name") ?? request.headers.get("host"),
  );

  // Placeholder response — cookies written by setAll are copied to the
  // final redirect response below.
  const cookieResponse = new NextResponse(null, { status: 200 });

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
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  // Redirect popup to the Google OAuth URL, carrying the PKCE verifier
  // cookie that Supabase set via setAll above (now parent-domain scoped).
  const redirect = NextResponse.redirect(data.url);
  cookieResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
    // Sweep any LEGACY host-only cookie of the same name written before
    // parent-domain scoping (or by a prior failed attempt). Without this, the
    // browser holds two `-code-verifier` cookies at different scopes and sends
    // both to /auth/callback; @supabase/ssr may read the stale host-only one
    // and the PKCE exchange fails. The parent-domain deletion is impossible via
    // the name-keyed cookies API (it would overwrite the value we just set), so
    // append a raw host-only `Max-Age=0` — same technique as middleware.ts's
    // clearStaleAuthCookies. Different scope from the value cookie above, so the
    // browser drops the host-only duplicate and keeps the parent-domain one.
    if (authCookieDomain && isSupabaseAuthCookie(cookie.name)) {
      redirect.headers.append(
        "set-cookie",
        `${cookie.name}=; Path=/; Max-Age=0`,
      );
    }
  });
  return redirect;
}
