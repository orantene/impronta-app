import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { normalizeNextPath } from "@/lib/auth-flow";
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
          cookieStore.set(name, value, options);
          cookieResponse.cookies.set(name, value, options);
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
  // cookie that Supabase set via setAll above.
  const redirect = NextResponse.redirect(data.url);
  cookieResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}
