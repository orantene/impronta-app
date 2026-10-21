import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { relinkFirstConfirmedClaim } from "@/lib/auth/guest-claim-relink";
import { resolvePostAuthRedirect } from "@/lib/auth/post-auth-return";
import {
  isRegisteredReturnHost,
  needsSsoHandoffHost,
} from "@/lib/auth/registered-return-host.server";
import { claimAndActivateVerifiedClient } from "@/lib/client-account/after-verified-sign-in.server";
import { isAuthEmailConfirmedForClaim } from "@/lib/client-account/pure";
import { postAuthContextForNext } from "@/lib/auth/post-auth-workspaces.server";
import { NextResponse } from "next/server";
import { activateSelfSignedClient } from "@/lib/client-account/guest-activate.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { confirmConflictHtml } from "@/lib/auth/confirm-conflict";

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

  // TUL-774: a confirm link opened while ANOTHER user is signed in must not silently
  // swap or ignore the session. Show who is signed in and let the visitor choose.
  // `switch=1` is the visitor's explicit "sign out and continue".
  if (searchParams.get("switch") !== "1") {
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (current) {
      const t = createTranslator(await getRequestLocale());
      const continueParams = new URLSearchParams(searchParams);
      continueParams.set("switch", "1");
      return new NextResponse(
        confirmConflictHtml({
          t,
          signedInEmail: current.email ?? "",
          continueHref: `${origin}/auth/confirm?${continueParams.toString()}`,
          stayHref: `${origin}/`,
        }),
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
        },
      );
    }
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (!error) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // First-confirm-wins guest-chat claim relink. Best-effort + non-fatal so it
    // never blocks the login (see lib/auth/guest-claim-relink.ts, shared with
    // the passwordless code path). Runs BEFORE the redirect.
    if (user) {
      await relinkFirstConfirmedClaim(user.id);
      // TUL-759/774: an explicit client sign-up (`signup_as=client`, stamped at sign-up) is a
      // client right away. Without this the new account has no role and the role screen
      // sent it to the seller /start flow.
      if (user.user_metadata?.signup_as === "client") {
        const admin = createServiceRoleClient();
        if (admin) await activateSelfSignedClient(admin, { userId: user.id, signupIntent: "client" });
      }
      // G3: claim every guest record for this proven email and activate a
      // guest booker, so the destination below reads the active profile.
      await claimAndActivateVerifiedClient({
        userId: user.id,
        email: user.email,
        emailProven: isAuthEmailConfirmedForClaim(user),
      });
    }
    const ensuredProfile = user
      ? await loadAccessProfile(supabase, user.id)
      : null;
    const destination = resolvePostAuthDestination(
      ensuredProfile,
      next,
      user ? await postAuthContextForNext(supabase, user.id, next) : {},
    );
    // TUL-691 E1: return to the site the claim started on (allow-listed).
    const target = await resolvePostAuthRedirect({
      rawNext: searchParams.get("next"),
      requestOrigin: origin,
      appUrl: getAppUrl(),
      destination,
      isRegisteredHost: isRegisteredReturnHost,
      needsSessionHandoff: needsSsoHandoffHost,
    });
    const successResponse = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => {
      successResponse.cookies.set(cookie);
    });
    return successResponse;
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
