import { createServerClient } from "@supabase/ssr";
import { loadAccessProfile } from "@/lib/access-profile";
import {
  buildAuthDebugHeaders,
  resolveAuthRoutingDecision,
  shouldAttachAuthDebug,
} from "@/lib/auth-routing";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";
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

export async function updateSession(
  request: NextRequest,
  options?: { pathnameForAuth?: string; languageSettings?: LanguageSettings },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const cookieGuest = request.cookies.get(GUEST_COOKIE)?.value;
  const guestKey = cookieGuest ?? crypto.randomUUID();
  const needsGuestCookie = !cookieGuest;

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

  const attachGuestCookie = (res: NextResponse) => {
    if (needsGuestCookie) {
      res.cookies.set(GUEST_COOKIE, guestKey, guestCookieOptions);
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
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  if (decision.redirectTo) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = decision.redirectTo;
    if (decision.loginNext) {
      redirectUrl.searchParams.set("next", decision.loginNext);
    } else {
      redirectUrl.search = "";
    }

    return applyImpersonationCookieClear(
      attachAuthDebug(attachGuestCookie(NextResponse.redirect(redirectUrl))),
    );
  }

  return applyImpersonationCookieClear(attachAuthDebug(supabaseResponse));
}
