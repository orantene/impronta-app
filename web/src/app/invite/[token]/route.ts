import { NextResponse } from "next/server";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { parseInviteToken } from "@/lib/invites/token";
import {
  setInviteCookieOnResponse,
} from "@/lib/invites/cookie";
import { redeemInvitePayload } from "@/lib/invites/redeem";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

/**
 * Phase 5/6 M5 — invite-link acceptance.
 *
 * An inviter (agency or hub admin) generates a signed `/invite/[token]` URL
 * with `createInviteToken`. When a visitor clicks it we:
 *
 *   1. Verify the token (HMAC + expiry).
 *   2. Set the verified payload in a short-lived HttpOnly cookie so it can
 *      survive an intervening sign-up / sign-in flow.
 *   3. Attempt redemption inline if the visitor already has a session and
 *      a talent profile — otherwise fall through to register/onboarding and
 *      let `/auth/callback` pick it up.
 *
 * The handler is app-host only (see `surface-allow-list.ts`) so the cookie
 * stays scoped to the canonical session surface.
 */

const ERROR_REDIRECTS = {
  invalid: "/?invite=invalid",
  expired: "/?invite=expired",
  config: "/?invite=config",
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { origin } = new URL(request.url);

  const secret = process.env.INVITE_TOKEN_HMAC_SECRET;
  if (!secret?.length) {
    return NextResponse.redirect(`${origin}${ERROR_REDIRECTS.config}`);
  }

  const verified = await parseInviteToken(token, secret);
  if (!verified.ok) {
    const target =
      verified.reason === "expired"
        ? ERROR_REDIRECTS.expired
        : ERROR_REDIRECTS.invalid;
    return NextResponse.redirect(`${origin}${target}`);
  }

  const payload = verified.payload;

  const session = await getCachedActorSession();
  const sessionUserId = session.user?.id ?? null;

  // Log click as best-effort; do not block the redirect on analytics.
  logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.invite_link_clicked,
    userId: sessionUserId,
    payload: {
      inviter_tenant_id: payload.inviterTenantId,
      inviter_user_id: payload.inviterUserId,
      intent: payload.intent,
      has_session: Boolean(sessionUserId),
    },
  }).catch(() => {});

  // Decide destination before redemption so the response can be built once.
  // Not signed in → register, carrying the app-host invite landing as `next`.
  // Signed in + no profile → onboarding role picker; redemption will fire on
  //   the next callback/session bounce once a profile exists.
  // Signed in + profile → inline redemption then /talent/representations.
  if (!sessionUserId) {
    const nextPath = encodeURIComponent(`/invite/${token}`);
    const response = NextResponse.redirect(
      `${origin}/register?next=${nextPath}`,
    );
    setInviteCookieOnResponse(response, payload);
    return response;
  }

  // Signed in — try immediate redemption. The redeem module returns
  // `no_profile` cleanly when the user hasn't finished onboarding yet.
  const redemptionResponse = NextResponse.redirect(
    `${origin}/talent/representations`,
  );
  setInviteCookieOnResponse(redemptionResponse, payload);

  const redeemed = await redeemInvitePayload(payload, redemptionResponse);

  if (redeemed.ok) {
    logAnalyticsEventServer({
      name: PRODUCT_ANALYTICS_EVENTS.invite_converted,
      userId: sessionUserId,
      payload: {
        inviter_tenant_id: payload.inviterTenantId,
        inviter_user_id: payload.inviterUserId,
        outcome: redeemed.outcome,
      },
    }).catch(() => {});
    return redemptionResponse;
  }

  if (redeemed.reason === "no_profile") {
    // User exists but hasn't completed onboarding — send them through the
    // role picker. Cookie stays set so `/auth/callback` or the next session
    // bounce picks it up.
    const onboardingResponse = NextResponse.redirect(
      `${origin}/onboarding/role`,
    );
    setInviteCookieOnResponse(onboardingResponse, payload);
    return onboardingResponse;
  }

  // Any other failure (invalid_tenant, submit_failed): fall through to the
  // representations dashboard. The redeem module already clears the cookie
  // for invalid_tenant; for submit_failed we leave the cookie so the user
  // can retry from the inviter's original link.
  return redemptionResponse;
}
