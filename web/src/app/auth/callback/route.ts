import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";
import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { redeemInvitePayload } from "@/lib/invites/redeem";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import {
  scheduleWorkspaceAudit,
  type WorkspaceAuditActorKind,
} from "@/lib/audit/workspace-audit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  cookieDomainForHost,
  isSupabaseAuthCookie,
} from "@/lib/supabase/cookie-domain";
import { NextResponse } from "next/server";
import { claimGuestSupportOnAuth } from "@/lib/support/guest-claim-auth";
import { claimTulalaBriefOnAuth } from "@/lib/tulala/brief-claim-auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = normalizeNextPath(searchParams.get("next"));
  const popup = searchParams.get("popup") === "1";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  if (code) {
    const cookieStore = await cookies();
    // Scope Supabase auth cookies to the shared parent domain
    // (".tulala.digital"), matching server.ts / client.ts / middleware.ts and
    // the /auth/google initiator. The exchange below reads the PKCE
    // `-code-verifier` by name (domain is irrelevant to reads), but the SESSION
    // cookies written on success must be parent-domain scoped so the freshly
    // authenticated session is visible across app / marketing / tenant
    // subdomains — otherwise the post-OAuth redirect to the app host lands
    // logged-out. `undefined` (localhost / custom domains) stays host-only.
    const authCookieDomain = cookieDomainForHost(
      request.headers.get("x-impronta-host-name") ??
        request.headers.get("host"),
    );
    const response = popup
      ? createPopupResponse(origin, { success: false, error: "Authentication failed." })
      : NextResponse.redirect(`${origin}/login?error=auth`);
    const supabase = createServerClient(url, key, {
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
            response.cookies.set(name, value, scoped);
          });
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await claimGuestSupportOnAuth(user.id);
        await claimTulalaBriefOnAuth(supabase, user.id);
      }

      // Talent-intent promotion for OAuth signups (e.g. Google via the talent
      // register modal). Email signups pass signup_intent in metadata and the
      // trigger sets app_role='talent' directly. OAuth signups can't pass
      // metadata through the provider, so we promote here when the next path
      // indicates a talent onboarding intent and the profile is freshly created
      // (app_role='client', account_status='onboarding').
      if (user && next.startsWith("/onboarding/talent")) {
        const admin = createServiceRoleClient();
        if (admin) {
          await admin
            .from("profiles")
            .update({ app_role: "talent" })
            .eq("id", user.id)
            .eq("app_role", "client")
            .eq("account_status", "onboarding");
        }
      }

      const ensuredProfile = user
        ? await loadAccessProfile(supabase, user.id)
        : null;

      // Workspace activity log — tenant hosts only. The proxy stamps the
      // tenant id on the request; on the platform host it is absent and we
      // skip auditing entirely.
      const auditTenantId = request.headers.get("x-impronta-tenant-id");
      if (auditTenantId && user) {
        scheduleWorkspaceAudit({
          tenantId: auditTenantId,
          category: "auth",
          action: "auth.signed_in",
          summary: "Signed in with Google or magic link",
          actorUserId: user.id,
          actorLabel: user.email ?? null,
          actorKind: auditActorKind(ensuredProfile?.app_role),
        });
      }

      const destination = resolvePostAuthDestination(ensuredProfile, next);
      // Always redirect post-auth destinations to the app host.
      // The auth callback runs on whatever host the OAuth provider returns to
      // (could be tulala.digital — the marketing host) but /onboarding/role,
      // /admin, /talent, /client are only allowed on the app host. Using
      // `origin` (the request host) caused a 404 when origin was the apex.
      const appUrl = getAppUrl();
      // Both branches must leave the marketing apex: /admin, /client,
      // /talent and /onboarding/* only exist on the app + agency surfaces.
      // The redirect branch has always hard-coded appUrl; the popup branch
      // used to post the RELATIVE path back to the opener, which then
      // router.push'd it on whatever host the popup was opened from.
      const successResponse = popup
        ? createPopupResponse(origin, {
            success: true,
            destination: await hostSafeRedirectDestination(destination),
          })
        : NextResponse.redirect(`${appUrl}${destination}`);
      response.cookies.getAll().forEach((cookie) => {
        successResponse.cookies.set(cookie);
      });

      // Phase 5/6 M5 — if an invite cookie is riding along, try to redeem
      // it now. Failures are non-fatal: missing profile keeps the cookie
      // set for a later session bounce; submit errors are logged but the
      // user still lands on their post-auth destination.
      const invitePayload = readInviteFromCookieStore(cookieStore);
      if (invitePayload && user) {
        const redeemed = await redeemInvitePayload(
          invitePayload,
          successResponse,
        );
        if (redeemed.ok) {
          logAnalyticsEventServer({
            name: PRODUCT_ANALYTICS_EVENTS.invite_converted,
            userId: user.id,
            payload: {
              inviter_tenant_id: invitePayload.inviterTenantId,
              inviter_user_id: invitePayload.inviterUserId,
              outcome: redeemed.outcome,
              source: "auth_callback",
            },
          }).catch(() => {});
        }
      }

      return successResponse;
    }
  }

  if (popup) {
    return createPopupResponse(origin, {
      success: false,
      error: "Authentication failed.",
    });
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

function auditActorKind(appRole: string | null | undefined): WorkspaceAuditActorKind {
  switch (appRole) {
    case "super_admin":
      return "platform";
    case "agency_staff":
      return "staff";
    case "talent":
      return "talent";
    default:
      return "client";
  }
}

function createPopupResponse(
  origin: string,
  payload: Omit<AuthPopupMessage, "type">,
) {
  const message: AuthPopupMessage = {
    type: AUTH_POPUP_MESSAGE_TYPE,
    ...payload,
  };
  const serializedMessage = JSON.stringify(message);
  const serializedOrigin = JSON.stringify(origin);

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <body>
    <script>
      const message = ${serializedMessage};
      const targetOrigin = ${serializedOrigin};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, targetOrigin);
      }
      window.close();
      document.body.textContent = message.success
        ? "Authentication complete. You can close this window."
        : (message.error || "Authentication failed. You can close this window.");
    </script>
  </body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
