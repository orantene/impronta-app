import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/auth-flow";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import {
  CONTINUE_TOKEN_MAX_AGE_MS,
  verifyConversationToken,
} from "@/lib/inquiry/conversation-email-tokens";

/**
 * /api/conversation/continue — the "Log in to continue the conversation" CTA
 * from the inquiry email loop (reply-mirror email).
 *
 * The email carries only an HMAC-signed conversation token — never a sign-in
 * credential. This route exchanges it AT CLICK TIME for a fresh Supabase
 * magic link (`generateLink` → token_hash) and 302s into the existing
 * `/auth/confirm` flow, which verifies the OTP, sets the SSR session cookies,
 * runs the idempotent guest-claim relink, and lands on the client Messages
 * surface with THE conversation open
 * (`/{tenantSlug}/client/messages?inquiry={id}`).
 *
 * Why exchange-at-click instead of a magic link in the email:
 *   - nothing sign-in-capable is at rest in the email body, the dispatch-log
 *     payload, or a forwarded message;
 *   - the link never goes stale from Supabase OTP expiry or a later email
 *     invalidating an earlier one — each click mints a fresh OTP;
 *   - an email-scanner prefetch consumes nothing the human needs (their own
 *     click mints its own OTP).
 *
 * Inquirers with no client account (provisioning was refused — privileged
 * email) fall back to the cookie-proven guest window at /c/{inquiryId} on the
 * tenant's branded host.
 */
/**
 * Every response here MUST be uncacheable. The success redirect carries a
 * ONE-TIME `token_hash` in its Location header: if a browser (or any
 * intermediary) caches it, the next click replays an already-consumed OTP and
 * the visitor gets "link expired" on a link that should have worked. Observed
 * live during QA — a cached 307 made repeat clicks skip the route entirely.
 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function GET(request: Request) {
  const appUrl = getAppUrl().replace(/\/$/, "");
  const fail = noStore(NextResponse.redirect(`${appUrl}/login?error=link_expired`));

  try {
    const { searchParams } = new URL(request.url);
    const verified = verifyConversationToken(
      searchParams.get("token"),
      "continue",
      CONTINUE_TOKEN_MAX_AGE_MS,
    );
    if (!verified.ok) {
      void improntaLog("conversation_continue.refused", { reason: verified.reason });
      return fail;
    }

    const admin = createServiceRoleClient();
    if (!admin) return fail;

    const { data: inqRow } = await admin
      .from("inquiries")
      .select("id, tenant_id, client_user_id")
      .eq("id", verified.inquiryId)
      .maybeSingle();
    if (!inqRow) return fail;
    const inquiry = inqRow as {
      id: string;
      tenant_id: string;
      client_user_id: string | null;
    };

    // No client account to sign into → the cookie-proven guest window on the
    // tenant's branded host (works on the browser the guest used).
    if (!inquiry.client_user_id) {
      const brand = await resolveTenantBrand(inquiry.tenant_id);
      return noStore(
        NextResponse.redirect(`${brand.homeHref.replace(/\/$/, "")}/c/${inquiry.id}`),
      );
    }

    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
      inquiry.client_user_id,
    );
    const email = userData?.user?.email ?? null;
    if (userErr || !email) {
      if (userErr) logServerError("conversation-continue/getUser", userErr);
      return fail;
    }

    // Idempotent account attach. `ensureGuestClientByEmail` provisions the
    // inquirer's account with account_status='onboarding', so without this the
    // magic link signs them in and `resolvePostAuthDestination` sends them to
    // the ROLE PICKER ("I'm Talent / I'm a Client / I run a business") instead
    // of their conversation — and a wrong pick there mangles the account. The
    // role is not actually in question: this account was created as a client
    // for this very inquiry, and clicking a link sent to that address proves
    // the email. Mark it active so the `next` deep-link is honored.
    //
    // STRICTLY narrowed to app_role='client' AND a non-active status — a staff
    // or talent account that happens to be the inquiry's client party is never
    // touched, and an already-active account is left alone (no-op on repeat
    // clicks, which is what makes this idempotent).
    const { data: profileRow } = await admin
      .from("profiles")
      .select("app_role, account_status")
      .eq("id", inquiry.client_user_id)
      .maybeSingle();
    const profile = profileRow as
      | { app_role: string | null; account_status: string | null }
      | null;
    if (profile?.app_role === "client" && profile.account_status !== "active") {
      const { error: attachErr } = await admin
        .from("profiles")
        .update({
          account_status: "active",
          onboarding_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inquiry.client_user_id)
        .eq("app_role", "client");
      // Non-fatal: a failed attach costs them the role-picker detour, not
      // access — the magic link below still signs them in.
      if (attachErr) logServerError("conversation-continue/attach", attachErr);
    }

    const { data: slugRow } = await admin
      .from("agencies")
      .select("slug")
      .eq("id", inquiry.tenant_id)
      .maybeSingle();
    const tenantSlug = (slugRow as { slug: string } | null)?.slug ?? null;
    const next = tenantSlug
      ? `/${tenantSlug}/client/messages?inquiry=${encodeURIComponent(inquiry.id)}`
      : `/client/inquiries/${inquiry.id}`;

    // Mint the OTP now. Use the token_hash (server-side verifyOtp flow), NOT
    // properties.action_link — action_link is Supabase's implicit/hash flow
    // (#access_token=…) which the PKCE-only callback can't consume. Same
    // contract as guest-claim-link.ts.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${appUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      if (linkErr) logServerError("conversation-continue/generateLink", linkErr);
      return fail;
    }

    void improntaLog("conversation_continue.exchange", {
      inquiryId: inquiry.id,
      tenantId: inquiry.tenant_id,
    });

    return noStore(
      NextResponse.redirect(
        `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`,
      ),
    );
  } catch (err) {
    logServerError("conversation-continue", err);
    return fail;
  }
}
