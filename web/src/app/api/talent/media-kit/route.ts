/**
 * GET /api/talent/media-kit — the talent's own media kit (EPK) as a PDF.
 *
 * Talent Pro is marketed with a "downloadable media kit"; this route is that
 * kit. Contents are drawn entirely from the talent's existing profile: name,
 * tagline, bio, talent types, city, "from" price, cover photo, up to six
 * gallery photos, and the public profile URL as the booking route.
 *
 * AUTH MODEL — session, never an id
 * ────────────────────────────────
 * The route takes NO profile identifier. `requireTalentSelf()` resolves the
 * talent profile from the session cookie, so there is nothing to guess and no
 * way to ask for another talent's kit. Tier is then checked with
 * `assertTalentCanGenerateMediaKit` (Pro / Portfolio), and a denial answers
 * with `planDeniedMessage("media_kit")` — the same copy the rest of the talent
 * tier surface uses.
 *
 * Mirrors the shape of `api/talent/tax-summary` (the other talent-self PDF).
 */

import { NextResponse } from "next/server";
import { isLocale, defaultLocale, type Locale } from "@/i18n/config";
import {
  assertTalentCanGenerateMediaKit,
  planDeniedMessage,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { loadTalentMediaKitModel } from "@/lib/talent/media-kit-source";
import { generateTalentMediaKitPdf } from "@/lib/talent/media-kit-pdf";

export const dynamic = "force-dynamic";

/** Deterministic chain: the asked-for locale, then the platform default. */
function fallbackChainFor(locale: Locale): Locale[] {
  return locale === defaultLocale ? [locale] : [locale, defaultLocale];
}

export async function GET(request: Request) {
  const guard = await requireTalentSelf();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, code: guard.code },
      { status: guard.code === "not_authenticated" ? 401 : 404 },
    );
  }

  if (!assertTalentCanGenerateMediaKit(guard.planKey)) {
    return NextResponse.json(
      { error: planDeniedMessage("media_kit"), code: "plan_denied" },
      { status: 403 },
    );
  }

  const requested = new URL(request.url).searchParams.get("locale");
  const locale: Locale = isLocale(requested) ? requested.trim() : defaultLocale;

  const source = await loadTalentMediaKitModel({
    talentProfileId: guard.talentProfile.id,
    locale,
    fallbackChain: fallbackChainFor(locale),
    generatedAtISO: new Date().toISOString(),
  });

  if (!source.ok) {
    return NextResponse.json(
      { error: "Media kit is unavailable right now.", code: source.reason },
      { status: source.reason === "profile_not_found" ? 404 : 503 },
    );
  }

  // pdf-lib returns Uint8Array<ArrayBufferLike>; Buffer satisfies both the
  // Node runtime's BodyInit and the TS 5.7+ generic-Uint8Array constraint.
  const bytes = Buffer.from(await generateTalentMediaKitPdf(source.model));

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${source.model.fileNameStem}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
