/**
 * Signup-context defaults for a brand-new talent (pure, unit tested).
 *
 * A talent who signs up with a Mexican phone number used to land on an English
 * dashboard with USD offerings, because nothing read the signup context. The
 * dial code on the phone (the one hard location signal the form collects) and
 * the browser's Accept-Language now seed `preferred_locale` and the default
 * currency. They are DEFAULTS only: the talent can change both in Settings.
 *
 * Currency rule (talents MXN or USD): Mexico gets MXN, everyone else keeps the
 * platform default, so the currency helper returns null unless the phone is
 * Mexican.
 */

/** Dial codes (with "+") of the Spanish-speaking markets we serve. */
const SPANISH_DIALS: readonly string[] = [
  "+52", // MX
  "+34", // ES
  "+54", // AR
  "+56", // CL
  "+57", // CO
  "+51", // PE
  "+58", // VE
  "+593", // EC
  "+502", // GT
  "+503", // SV
  "+504", // HN
  "+505", // NI
  "+506", // CR
  "+507", // PA
  "+591", // BO
  "+595", // PY
  "+598", // UY
  "+53", // CU
];

/** The Spanish dial code a posted phone ("+52 55 1234 5678") starts with, if any. */
function spanishDialOf(phone: string | null | undefined): string | null {
  const compact = (phone ?? "").replace(/\s+/g, "");
  if (!compact.startsWith("+")) return null;
  // Longest code first so "+593" is never read as "+59...".
  const sorted = [...SPANISH_DIALS].sort((a, b) => b.length - a.length);
  return sorted.find((dial) => compact.startsWith(dial)) ?? null;
}

/** Top language of an Accept-Language header, bare ("es-MX;q=0.9" -> "es"). */
export function topAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim().split(";")[0]?.trim().toLowerCase() ?? "";
  const lang = first.split("-")[0] ?? "";
  return /^[a-z]{2,3}$/.test(lang) ? lang : null;
}

/** `es` for Spanish-speaking dial codes or a Spanish browser, else `en`. */
export function deriveTalentLocale(input: {
  phone?: string | null;
  acceptLanguage?: string | null;
}): "en" | "es" {
  if (spanishDialOf(input.phone)) return "es";
  return topAcceptLanguage(input.acceptLanguage) === "es" ? "es" : "en";
}

/** `MXN` for a Mexican phone, otherwise null (keep the platform default). */
export function deriveTalentCurrency(phone: string | null | undefined): "MXN" | null {
  return spanishDialOf(phone) === "+52" ? "MXN" : null;
}
