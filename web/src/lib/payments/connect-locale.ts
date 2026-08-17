/**
 * Maps a Tulala dashboard locale onto the locale string Stripe's embedded
 * Connect components expect.
 *
 * Why this exists: without an explicit `locale`, `loadConnectAndInitialize`
 * falls back to the BROWSER language, so a Mexican or Argentine talent whose
 * browser is set to English gets an English KYC form with only a small manual
 * language picker in Stripe's footer. For a LatAm-first product that is exactly
 * backwards — the people most likely to need Spanish are the ones we route
 * through the recipient flow.
 *
 * Stripe accepts BCP-47 tags. For Spanish it distinguishes:
 *   - `es-419`  Latin American Spanish  ← what our MX/AR/CL/CO talent should see
 *   - `es`      European Spanish
 * We deliberately prefer `es-419`, since the whole recipient roster is Latin
 * American. A caller may still pass a full regional tag (e.g. "es-MX") and it
 * is forwarded untouched, so a future per-country override needs no change here.
 */

/** Locales Stripe's embedded Connect components are documented to support. */
const SUPPORTED_BASE = new Set([
  "en", "es", "pt", "fr", "de", "it", "nl", "pl", "sv", "da", "no", "fi",
  "cs", "el", "hu", "ro", "sk", "sl", "bg", "et", "lv", "lt", "mt", "tr",
  "ja", "ko", "zh", "th", "vi", "id", "ms", "ar", "he", "ru",
]);

/**
 * @param locale a Tulala dashboard locale ("en", "es", "es-MX", …)
 * @returns a locale string safe to hand to `loadConnectAndInitialize`, or
 *          `undefined` to let Stripe decide when we have nothing better.
 */
export function stripeConnectLocale(locale: string | null | undefined): string | undefined {
  const raw = (locale ?? "").trim();
  if (!raw) return undefined;

  // Already regional ("es-MX", "pt-BR"): forward as-is when the base is known.
  const [base, region] = raw.toLowerCase().split(/[-_]/);
  if (!SUPPORTED_BASE.has(base)) return undefined;
  if (region) return `${base}-${region.toUpperCase()}`;

  // Bare "es" from our locale cookie means our Spanish audience, which is
  // Latin American — not Spain.
  if (base === "es") return "es-419";
  return base;
}
