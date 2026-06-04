import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { NextResponse } from "next/server";

/**
 * First-confirm-wins guest-chat claim relink.
 *
 * A guest can send the sign-in link to a different/additional email; each one is
 * provisioned an onboarding client account and registered as a candidate in
 * inquiries.claim_candidate_user_ids (see guest-chat-actions). When ONE of those
 * candidate emails confirms its magic-link here, we relink any inquiry where:
 *   - the confirming user is a registered candidate, AND
 *   - the inquiry's CURRENT owner account is still account_status='onboarding'
 *     (i.e. unclaimed) — so the FIRST candidate to confirm wins; once the owner
 *     is active, later confirms match nothing.
 *
 * This is secure: the magic link proves the confirming user owns that email, and
 * the email was a candidate the cookie-owning guest deliberately added. The whole
 * thing is best-effort / non-fatal so it can never block the login.
 */
async function relinkFirstConfirmedClaim(userId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;

    // Candidate inquiries where this confirming user is eligible to claim.
    const { data: rows, error } = await admin
      .from("inquiries")
      .select("id, client_user_id")
      .contains("claim_candidate_user_ids", [userId]);
    if (error || !rows || rows.length === 0) {
      if (error) logServerError("auth/confirm/relinkFirstConfirmedClaim/select", error);
      return;
    }

    for (const row of rows as Array<{ id: string; client_user_id: string | null }>) {
      const currentOwner = row.client_user_id;
      // Already owned by the confirming user — nothing to do.
      if (currentOwner === userId) continue;

      // The inquiry is only claimable while its current owner is an UNCLAIMED
      // (onboarding) provisioned account. If the owner has gone active, another
      // candidate already won — leave it alone (first-confirm-wins).
      if (currentOwner) {
        const { data: ownerProfile, error: ownerErr } = await admin
          .from("profiles")
          .select("account_status")
          .eq("id", currentOwner)
          .maybeSingle();
        if (ownerErr) {
          logServerError("auth/confirm/relinkFirstConfirmedClaim/ownerStatus", ownerErr);
          continue;
        }
        if ((ownerProfile?.account_status as string | null) !== "onboarding") {
          continue; // owner is active/claimed — do not steal it.
        }
      }

      const { error: relinkErr } = await admin
        .from("inquiries")
        .update({ client_user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (relinkErr) {
        logServerError("auth/confirm/relinkFirstConfirmedClaim/update", relinkErr);
      }
    }
  } catch (err) {
    logServerError("auth/confirm/relinkFirstConfirmedClaim", err);
  }
}

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
    // First-confirm-wins guest-chat claim relink. Best-effort + non-fatal so it
    // never blocks the login (see helper above). Runs BEFORE the redirect.
    if (user) {
      await relinkFirstConfirmedClaim(user.id);
    }
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
