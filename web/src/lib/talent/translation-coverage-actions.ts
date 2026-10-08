"use server";

/**
 * Website settings > Languages server reads (PR 7): the coverage line and the
 * suggested primary. Owner-only (the signed-in talent's own profile).
 */
import { headers } from "next/headers";

import { acceptLanguageSignal, languageForCountry } from "@/i18n/locale-suggestion";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import { loadOwnTalentProfileId } from "./talent-languages-store";
import { coverage } from "./translation-coverage";
import { loadCoverageFields } from "./translation-coverage-store";

const LIVE = ["es", "en"];

/** "{translated} of {total} fields translated to {target}" for the signed-in talent. */
export async function loadTranslationCoverage(
  target: string,
): Promise<{ ok: true; translated: number; total: number } | { ok: false }> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) return { ok: false };
    const id = await loadOwnTalentProfileId(session.user.id);
    if (!id) return { ok: false };
    const settings = await loadTalentLocaleSettings(id);
    const fields = await loadCoverageFields(id);
    return { ok: true, ...coverage(fields, settings.defaultLocale, target) };
  } catch (err) {
    logServerError("coverage.load", err);
    return { ok: false };
  }
}

/** Suggested primary from Accept-Language, then the IP country; null when unsure. */
export async function suggestTalentPrimaryLocaleAction(): Promise<string | null> {
  try {
    const h = await headers();
    const signal = acceptLanguageSignal(h.get("accept-language"), LIVE);
    if (signal.kind === "supported") return signal.locale;
    if (signal.kind === "unsupported") return null;
    const country = languageForCountry(h.get("x-vercel-ip-country"));
    return country && LIVE.includes(country) ? country : null;
  } catch (err) {
    logServerError("languages.suggest", err);
    return null;
  }
}
