import { createServerClient } from "@supabase/ssr";
import { cookieDomainForHost, isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";
import { loadAccessProfile } from "@/lib/access-profile";
import {
  buildAuthDebugHeaders,
  resolveAuthRoutingDecision,
  shouldAttachAuthDebug,
} from "@/lib/auth-routing";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";
import { signGuestCookie, verifyGuestCookie } from "@/lib/guest-cookie";
import { clearImpersonationCookieOnResponse } from "@/lib/impersonation/cookie";
import { resolveImpersonationRoutingForMiddleware } from "@/lib/impersonation/dashboard-identity";
import { NextRequest, NextResponse } from "next/server";
import type { LanguageSettings } from "@/lib/language-settings/types";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { stripLocaleFromPathname } from "@/i18n/pathnames";

const GUEST_COOKIE = "impronta_guest";
const GUEST_HEADER = "x-impronta-guest";
const LOCALE_HEADER = "x-impronta-locale";

/**
 * Sprint 2.1 — request-scoped actor forwarding from middleware to RSCs/server
 * actions. Middleware already calls `supabase.auth.getUser()` + a profile read
 * to make routing decisions; without forwarding, every server action repeats
 * that work via `requireStaff()`. Deployed-tier measurement showed this
 * adds ~300–600 ms per server action on the inspector load path.
 *
 * The internal header names below are reserved for middleware's verified
 * actor identity. Any incoming version of these headers is stripped on
 * every request (anti-spoof) — only middleware can write them. The action
 * trusts them because middleware always runs first and the header values
 * came from the same `getUser` + `loadAccessProfile` pair we'd otherwise
 * recompute downstream.
 *
 * The fast-path is intentionally minimal: just enough to satisfy
 * `requireStaff` / `requireSession` / `requireAdmin` without re-issuing
 * the RPC. Anything that needs the full Supabase `User` object (email,
 * metadata) still falls through to the uncached path.
 */
const ACTOR_ID_HEADER = "x-impronta-actor-id";
const ACTOR_EMAIL_HEADER = "x-impronta-actor-email";
const ACTOR_APP_ROLE_HEADER = "x-impronta-actor-app-role";
const ACTOR_STATUS_HEADER = "x-impronta-actor-status";
const ACTOR_ONBOARDED_HEADER = "x-impronta-actor-onboarded";

const ACTOR_HEADERS_TO_STRIP = [
  ACTOR_ID_HEADER,
  ACTOR_EMAIL_HEADER,
  ACTOR_APP_ROLE_HEADER,
  ACTOR_STATUS_HEADER,
  ACTOR_ONBOARDED_HEADER,
];

/**
 * True only for an UNRECOVERABLE Supabase refresh-token failure — the token is
 * gone / already-rotated, so no retry can succeed and the cookie must be
 * cleared. Deliberately narrow: a transient network/5xx error to the auth
 * server must NOT match (we don't want to log a valid session out on a blip).
 */
function isUnrecoverableRefreshTokenError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    code === "refresh_token_not_found" ||
    code === "refresh_token_already_used" ||
    msg.includes("refresh token not found") ||
    msg.includes("invalid refresh token")
  );
}

export async function updateSession(
  request: NextRequest,
  options?: { pathnameForAuth?: string; languageSettings?: LanguageSettings },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // The `impronta_guest` cookie is an HMAC-signed bearer token
  // (`${id}.${sig}`). Verify the inbound value before trusting it: a valid
  // signature yields the PLAIN id (forwarded downstream); an invalid OR
  // legacy-unsigned value is treated as absent so we mint a fresh signed
  // cookie + new id. When GUEST_COOKIE_SECRET is unset, verify/sign degrade
  // to the legacy raw-UUID behavior (see @/lib/guest-cookie).
  const rawGuestCookie = request.cookies.get(GUEST_COOKIE)?.value;
  const verifiedGuestId = verifyGuestCookie(rawGuestCookie);
  const guestKey = verifiedGuestId ?? crypto.randomUUID();
  // Re-mint the cookie whenever the inbound value didn't verify to the exact
  // plain id we'll forward (absent, forged, or legacy-unsigned). When the
  // signature is valid we leave the existing signed cookie in place.
  const needsGuestCookie = verifiedGuestId === null || rawGuestCookie !== signGuestCookie(guestKey);

  const pathnameForAuth = options?.pathnameForAuth ?? request.nextUrl.pathname;
  const lang = options?.languageSettings ?? FALLBACK_LANGUAGE_SETTINGS;

  const forwardedHeaders = new Headers(request.headers);
  // Sprint 2.1 — strip any client-supplied spoofs of the actor headers
  // BEFORE we copy them downstream. Only middleware (post-getUser) is
  // allowed to write these.
  for (const h of ACTOR_HEADERS_TO_STRIP) forwardedHeaders.delete(h);
  forwardedHeaders.set(GUEST_HEADER, guestKey);
  const presetLocale = request.headers.get(LOCALE_HEADER);
  const fromPath = stripLocaleFromPathname(pathnameForAuth, lang).locale;
  const presetOk =
    Boolean(presetLocale) &&
    (lang.publicLocales.includes(presetLocale!) || presetLocale === lang.defaultLocale);
  forwardedHeaders.set(LOCALE_HEADER, presetOk && presetLocale ? presetLocale : fromPath);

  const guestCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    secure: process.env.NODE_ENV === "production",
  };

  const authDebugEnabled = shouldAttachAuthDebug(request.nextUrl.searchParams);

  // Store the SIGNED token in the cookie; the PLAIN id travels downstream via
  // the x-impronta-guest header (set on forwardedHeaders above).
  const signedGuestCookie = signGuestCookie(guestKey);
  const attachGuestCookie = (res: NextResponse) => {
    if (needsGuestCookie) {
      res.cookies.set(GUEST_COOKIE, signedGuestCookie, guestCookieOptions);
    }
    return res;
  };

  const nextPreservingUrl = () =>
    NextResponse.next({
      request: new NextRequest(request.nextUrl, {
        headers: forwardedHeaders,
        method: request.method,
      }),
    });

  let supabaseResponse = attachGuestCookie(nextPreservingUrl());

  if (!url || !anon) {
    return supabaseResponse;
  }

  // Scope auth cookies to the shared parent domain (".tulala.digital") so a
  // session rotated/created on any first-party subdomain is visible across all
  // of them. `undefined` for hosts we don't share across → host-only as before.
  const authCookieDomain = cookieDomainForHost(
    request.headers.get("x-impronta-host-name") ?? request.headers.get("host"),
  );

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = attachGuestCookie(nextPreservingUrl());
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            ...(authCookieDomain && isSupabaseAuthCookie(name)
              ? { domain: authCookieDomain }
              : {}),
          }),
        );
      },
    },
  });

  // A stale/invalid refresh token makes `getUser()` FAIL (and sometimes throw)
  // on every request; `.catch` normalizes a throw into the same logged-out
  // `{ data, error }` shape so the code below treats it as "no user".
  const authResult = await supabase.auth
    .getUser()
    .catch((authThrow: unknown) => ({
      data: { user: null },
      error: authThrow,
    }));
  const user = authResult.data.user;

  // Auth resilience: when the refresh token is UNRECOVERABLE, the stale auth
  // cookie is never removed, so the user gets STUCK — every request fails and
  // even re-login bounces straight back to /login. Expire the Supabase auth
  // cookies so the browser returns to a clean logged-out state and login works
  // again. A SPECIFIC error check (never on a transient/network error) keeps
  // this from logging anyone out spuriously. Applied to BOTH the redirect and
  // the passthrough response below so it isn't dropped by a response rebuild.
  const shouldClearStaleAuth =
    !user && isUnrecoverableRefreshTokenError(authResult.error);
  const clearStaleAuthCookies = (res: NextResponse): NextResponse => {
    if (!shouldClearStaleAuth) return res;
    for (const c of request.cookies.getAll()) {
      if (!isSupabaseAuthCookie(c.name)) continue;
      res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
      if (authCookieDomain) {
        res.cookies.set(c.name, "", {
          maxAge: 0,
          path: "/",
          domain: authCookieDomain,
        });
      }
    }
    return res;
  };

  const pathname = pathnameForAuth;

  let sessionProfile: {
    account_status: string | null;
    app_role: string | null;
    onboarding_completed_at?: string | null;
  } | null = null;

  if (user) {
    sessionProfile = await loadAccessProfile(supabase, user.id);
  }

  // Sprint 2.1 — write the verified actor onto `forwardedHeaders` so
  // downstream RSCs / server actions can skip a duplicate `getUser` +
  // `loadAccessProfile` chain. The deployed-tier measurement showed
  // each server action paid ~300–600 ms for this redundant work; the
  // cache lives in the `getCachedActorSession` fast path
  // (`@/lib/server/request-cache`).
  //
  // We rebuild `supabaseResponse` after mutating headers so the inner
  // NextRequest seen by downstream code reflects the new values.
  // Cookies set on the previous response (Supabase session rotation,
  // guest cookie) are carried forward.
  if (user) {
    forwardedHeaders.set(ACTOR_ID_HEADER, user.id);
    if (user.email) forwardedHeaders.set(ACTOR_EMAIL_HEADER, user.email);
    if (sessionProfile?.app_role) {
      forwardedHeaders.set(ACTOR_APP_ROLE_HEADER, sessionProfile.app_role);
    }
    if (sessionProfile?.account_status) {
      forwardedHeaders.set(ACTOR_STATUS_HEADER, sessionProfile.account_status);
    }
    forwardedHeaders.set(
      ACTOR_ONBOARDED_HEADER,
      sessionProfile?.onboarding_completed_at ? "1" : "0",
    );

    const fresh = nextPreservingUrl();
    for (const c of supabaseResponse.cookies.getAll()) {
      fresh.cookies.set(c);
    }
    supabaseResponse = fresh;
  }

  const rawImpersonationCookie = request.cookies.get(
    IMPERSONATION_COOKIE_NAME,
  )?.value;

  let routingProfile = sessionProfile;
  let isImpersonating = false;
  let clearImpersonationCookie = Boolean(
    !user && rawImpersonationCookie?.length,
  );

  if (user) {
    const imp = await resolveImpersonationRoutingForMiddleware({
      rawCookie: rawImpersonationCookie,
      supabase,
      actorUserId: user.id,
      actorProfile: sessionProfile,
    });
    routingProfile = imp.routingProfile ?? sessionProfile;
    isImpersonating = imp.isImpersonating;
    clearImpersonationCookie = imp.clearCookie;
  }

  const decision = resolveAuthRoutingDecision({
    pathname,
    userId: user?.id ?? null,
    sessionProfile,
    routingProfile: user ? routingProfile : null,
    isImpersonating: user ? isImpersonating : false,
    // Forward the `?next=` searchParam so already-logged-in users hitting
    // /login or /register get redirected to the path they were trying to
    // reach (e.g. the funnel's /onboarding/workspace?lead=…), not their
    // existing dashboard.
    nextParam: request.nextUrl.searchParams.get("next"),
  });

  const applyImpersonationCookieClear = (res: NextResponse) => {
    if (clearImpersonationCookie) {
      clearImpersonationCookieOnResponse(res);
    }
    return res;
  };

  const attachAuthDebug = (res: NextResponse) => {
    if (!authDebugEnabled) {
      return res;
    }

    const headers = buildAuthDebugHeaders({
      userId: user?.id ?? null,
      profile: sessionProfile,
      dashboardDestination: decision.dashboardDestination,
    });

    Object.entries(headers).forEach(([name, value]) => {
      res.headers.set(name, value);
    });

    return res;
  };

  // Server Actions POST to the page's current path with a `Next-Action`
  // header and expect a Server-Action-shaped response back. An auth-routing
  // *redirect* here (e.g. nudging a just-authenticated, still-onboarding user
  // off `/`) would replace that response and surface as "An unexpected
  // response was received from the server", aborting the action mid-flight.
  // Actions enforce their own auth (requireSession/requireStaff), so it's safe
  // — and necessary — to let them run and return their own result. Only GET
  // navigations get the routing redirect.
  const isServerActionRequest =
    request.method === "POST" && request.headers.has("next-action");

  if (decision.redirectTo && !isServerActionRequest) {
    const redirectUrl = request.nextUrl.clone();
    // decision.redirectTo may include a query string when honoring `?next=`
    // (e.g. "/onboarding/workspace?lead=abc"). Parse it so pathname and
    // searchParams land in the right slots — assigning a "pathname?query"
    // string to .pathname would URL-encode the "?" and break the route.
    const [targetPath, targetQuery] = decision.redirectTo.split("?", 2);
    redirectUrl.pathname = targetPath;
    redirectUrl.search = "";
    if (targetQuery) {
      const incoming = new URLSearchParams(targetQuery);
      incoming.forEach((value, key) => redirectUrl.searchParams.set(key, value));
    }
    if (decision.loginNext) {
      redirectUrl.searchParams.set("next", decision.loginNext);
    }

    return clearStaleAuthCookies(
      applyImpersonationCookieClear(
        attachAuthDebug(attachGuestCookie(NextResponse.redirect(redirectUrl))),
      ),
    );
  }

  return clearStaleAuthCookies(
    applyImpersonationCookieClear(attachAuthDebug(supabaseResponse)),
  );
}
