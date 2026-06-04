import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { NextResponse } from "next/server";

/**
 * /auth/confirm — server-side OTP/magic-link verification (the token_hash flow).
 *
 * Email links generated server-side via `admin.generateLink({ type: "magiclink" })`
 * deliver a `token_hash`, NOT a PKCE `?code`. The implicit `action_link` returns the
 * session in the URL FRAGMENT (#access_token=…) which never reaches the server, so it
 * cannot be consumed by /auth/callback (PKCE only) — it bounces to /login?error=auth.
 *
 * This route consumes the token_hash with `verifyOtp`, which sets the SSR session
 * cookies, then routes to the post-auth destination — same as the OAuth callback.
 * Used by the guest→registered-client claim email (guest-claim-link.ts).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const next = normalizeNextPath(searchParams.get("next"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }
  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}/login?error=auth`);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (!error) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const ensuredProfile = user
      ? await loadAccessProfile(supabase, user.id)
      : null;
    const destination = resolvePostAuthDestination(ensuredProfile, next);
    const appUrl = getAppUrl();
    const successResponse = NextResponse.redirect(`${appUrl}${destination}`);
    response.cookies.getAll().forEach((cookie) => {
      successResponse.cookies.set(cookie);
    });
    return successResponse;
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
