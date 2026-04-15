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
