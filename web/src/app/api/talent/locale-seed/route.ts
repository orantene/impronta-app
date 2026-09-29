// Talent dashboard locale seed (2026-09-29).
//
// The talent layout redirects here once when the `locale` cookie is absent or
// auto-written and differs from the talent's primary language. A server
// layout cannot write cookies, and `redirectToLocaleEquivalent` targets
// locale-PREFIXED public paths (dashboards are never prefixed), so this
// handler is the one place that writes the seed. It re-derives everything
// from the session (the query only carries where to go back to), never
// overwrites a deliberate cookie, and writes the AUTO marker so a later
// change of primary re-seeds. Contract: `@/i18n/locale-cookies`.

import { NextResponse, type NextRequest } from "next/server";

import {
  LOCALE_COOKIE,
  localeCookieIsAutoWritten,
  seedTalentDashboardLocaleCookie,
} from "@/i18n/locale-middleware";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import {
  safeTalentNextPath,
  TALENT_LOCALE_SEED_ATTEMPT_COOKIE,
  TALENT_LOCALE_SEED_ATTEMPT_MAX_AGE_SECONDS,
  talentLocaleSeedTarget,
} from "@/lib/site-admin/server/talent-locale-seed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = safeTalentNextPath(request.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, request.nextUrl.origin), 307);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(TALENT_LOCALE_SEED_ATTEMPT_COOKIE, "1", {
    path: "/",
    maxAge: TALENT_LOCALE_SEED_ATTEMPT_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  const scope = await requireTalentSelf();
  if (!scope.ok) return res;

  const settings = await loadTalentLocaleSettings(scope.talentProfile.id);
  const target = talentLocaleSeedTarget({
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value ?? null,
    cookieIsAuto: localeCookieIsAutoWritten(request),
    primary: settings.defaultLocale,
  });
  if (target) seedTalentDashboardLocaleCookie(res, target);
  return res;
}
