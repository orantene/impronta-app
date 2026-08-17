/**
 * Vendor locale handoff — map the app's OWN resolved locale onto the language
 * tag each embedded third-party widget expects.
 *
 * WHY THIS FILE EXISTS
 * Every third-party widget we embed (Stripe Checkout, the Stripe Billing
 * Portal, Stripe.js Elements, hCaptcha, Cloudflare Turnstile, a Google Maps
 * iframe) defaults to the BROWSER language when no explicit tag is passed. A
 * Mexican client who set Tulala to Spanish but runs an English browser then
 * gets an English payment form, an English captcha and an English map inside a
 * Spanish page. The app already knows the answer — `getRequestLocale()` on the
 * server, `useDashboardLocale()` on the client — so it must say so out loud.
 *
 * This mirrors `lib/payments/connect-locale.ts`, which does exactly this for
 * Stripe's embedded Connect components, and generalises its two rules:
 *
 *   1. Bare `es` means OUR Spanish audience, which is Latin American, not
 *      Iberian. Where the vendor ships a Latin American variant (`es-419`) we
 *      prefer it. Where it does not (hCaptcha, Turnstile) we fall back to the
 *      base `es` rather than inventing a tag the vendor would reject.
 *   2. When we have nothing valid to say we return `undefined` and the caller
 *      omits the parameter. A vendor default beats an invalid tag: an
 *      unrecognised value can render an untranslated widget, or (Turnstile)
 *      fail to render at all.
 *
 * Everything here is PURE — no network, no `next/headers`, no `window` — so it
 * is unit-testable and safe to import from client and server alike.
 *
 * Tag sets verified 2026-08-16 against:
 *   - Stripe Node SDK types (`Checkout.SessionCreateParams.Locale`,
 *     `BillingPortal.SessionCreateParams.Locale`) — the authority tsc enforces
 *   - `@stripe/stripe-js` `StripeElementLocale`
 *   - https://docs.hcaptcha.com/languages/
 *   - https://developers.cloudflare.com/turnstile/reference/supported-languages/
 *   - https://developers.google.com/maps/faq (supported languages)
 */

/** Lowercased-tag → canonical-tag lookup for one vendor. */
type VendorTagTable = Readonly<Record<string, string>>;

type VendorLocaleTable = {
  tags: VendorTagTable;
  /**
   * The tag this vendor uses for LATIN AMERICAN Spanish, when it has one.
   * Absent means the vendor only ships one Spanish and Spanish speakers must
   * land on the base `es`.
   */
  latamSpanish?: string;
};

function tagTable(tags: readonly string[]): VendorTagTable {
  const out: Record<string, string> = {};
  for (const tag of tags) out[tag.toLowerCase()] = tag;
  return out;
}

/**
 * The one shared resolution rule. Order matters:
 *
 *   1. EXACT tag the vendor lists (`pt-BR`, `zh-TW`, `es-419`, `en-GB`, …).
 *   2. Spanish with any region other than Spain (including bare `es`) →  the
 *      vendor's Latin American Spanish, when it has one.
 *   3. The base language, when the vendor lists it.
 *   4. `undefined` — say nothing rather than something invalid.
 *
 * @param locale a Tulala locale ("en", "es", "es-MX", "pt-BR", …)
 */
export function resolveVendorLocale(
  locale: string | null | undefined,
  table: VendorLocaleTable,
): string | undefined {
  const raw = (locale ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return undefined;

  const [base, region] = raw.split("-");
  // A base must look like an ISO 639 code. This is the garbage gate: "klingon",
  // "not a locale" and "" all stop here instead of reaching a vendor.
  if (!/^[a-z]{2,3}$/.test(base)) return undefined;

  // Bare `es` is the one input that must NOT short-circuit on the vendor's own
  // `es` entry: for us bare Spanish means Latin American Spanish, and almost
  // every vendor's `es` is the Iberian one. Every other exact hit wins.
  const isBareSpanish = base === "es" && !region;
  const exact = table.tags[raw];
  if (exact && !isBareSpanish) return exact;

  // Bare `es` and every LatAm regional Spanish route to the vendor's `es-419`.
  // `es-ES` is explicitly Spain and must not.
  if (base === "es" && region !== "es" && table.latamSpanish) {
    return table.latamSpanish;
  }

  return table.tags[base];
}

// ─── Stripe Checkout ──────────────────────────────────────────────────────────

const STRIPE_CHECKOUT_TAGS = [
  "auto", "bg", "cs", "da", "de", "el", "en", "en-GB", "es", "es-419", "et",
  "fi", "fil", "fr", "fr-CA", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv",
  "ms", "mt", "nb", "nl", "pl", "pt", "pt-BR", "ro", "ru", "sk", "sl", "sv",
  "th", "tr", "vi", "zh", "zh-HK", "zh-TW",
] as const;

/** Assignable to `Stripe.Checkout.SessionCreateParams.Locale` — tsc enforces it. */
export type StripeCheckoutLocale = (typeof STRIPE_CHECKOUT_TAGS)[number];

const STRIPE_CHECKOUT_TABLE: VendorLocaleTable = {
  tags: tagTable(STRIPE_CHECKOUT_TAGS),
  latamSpanish: "es-419",
};

export function stripeCheckoutLocale(
  locale: string | null | undefined,
): StripeCheckoutLocale | undefined {
  return resolveVendorLocale(locale, STRIPE_CHECKOUT_TABLE) as
    | StripeCheckoutLocale
    | undefined;
}

// ─── Stripe Billing Portal ────────────────────────────────────────────────────

// Same set as Checkout plus the extra English regionals the portal ships.
const STRIPE_PORTAL_TAGS = [
  "auto", "bg", "cs", "da", "de", "el", "en", "en-AU", "en-CA", "en-GB",
  "en-IE", "en-IN", "en-NZ", "en-SG", "es", "es-419", "et", "fi", "fil", "fr",
  "fr-CA", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "mt", "nb",
  "nl", "pl", "pt", "pt-BR", "ro", "ru", "sk", "sl", "sv", "th", "tr", "vi",
  "zh", "zh-HK", "zh-TW",
] as const;

/** Assignable to `Stripe.BillingPortal.SessionCreateParams.Locale`. */
export type StripeBillingPortalLocale = (typeof STRIPE_PORTAL_TAGS)[number];

const STRIPE_PORTAL_TABLE: VendorLocaleTable = {
  tags: tagTable(STRIPE_PORTAL_TAGS),
  latamSpanish: "es-419",
};

export function stripeBillingPortalLocale(
  locale: string | null | undefined,
): StripeBillingPortalLocale | undefined {
  return resolveVendorLocale(locale, STRIPE_PORTAL_TABLE) as
    | StripeBillingPortalLocale
    | undefined;
}

// ─── Stripe.js / Elements ─────────────────────────────────────────────────────

const STRIPE_JS_TAGS = [
  "auto", "ar", "bg", "cs", "da", "de", "el", "en", "en-AU", "en-CA", "en-NZ",
  "en-GB", "es", "es-ES", "es-419", "et", "fi", "fil", "fr", "fr-CA", "fr-FR",
  "he", "hu", "hr", "id", "it", "it-IT", "ja", "ko", "lt", "lv", "ms", "mt",
  "nb", "nl", "no", "pl", "pt", "pt-BR", "ro", "ru", "sk", "sl", "sv", "th",
  "tr", "vi", "zh", "zh-HK", "zh-TW",
] as const;

/** Assignable to `@stripe/stripe-js`'s `StripeElementLocale`. */
export type StripeJsLocale = (typeof STRIPE_JS_TAGS)[number];

const STRIPE_JS_TABLE: VendorLocaleTable = {
  tags: tagTable(STRIPE_JS_TAGS),
  latamSpanish: "es-419",
};

export function stripeJsLocale(
  locale: string | null | undefined,
): StripeJsLocale | undefined {
  return resolveVendorLocale(locale, STRIPE_JS_TABLE) as StripeJsLocale | undefined;
}

// ─── hCaptcha (`hl` / `data-hl`) ──────────────────────────────────────────────

// hCaptcha documents ONE Spanish (`es`). Its only regional variants are
// pt-BR / zh-CN / zh-TW, so `es-MX` must degrade to `es`, never to `es-419`.
const HCAPTCHA_TAGS = [
  "af", "sq", "am", "ar", "hy", "az", "eu", "be", "bn", "bg", "bs", "my", "ca",
  "ceb", "zh", "zh-CN", "zh-TW", "co", "hr", "cs", "da", "nl", "en", "eo",
  "et", "fa", "fi", "fr", "fy", "gd", "gl", "ka", "de", "el", "gu", "ht", "ha",
  "haw", "he", "hi", "hmn", "hu", "is", "ig", "id", "ga", "it", "ja", "jw",
  "kn", "kk", "km", "rw", "ky", "ko", "ku", "lo", "la", "lv", "lt", "lb", "mk",
  "mg", "ms", "ml", "mt", "mi", "mr", "mn", "me", "ne", "no", "ny", "or", "ps",
  "pl", "pt", "pt-BR", "pa", "ro", "ru", "sm", "sn", "sd", "si", "sr", "sk",
  "sl", "so", "st", "es", "su", "sw", "sv", "tl", "tg", "ta", "tt", "te", "th",
  "tr", "tk", "ug", "uk", "ur", "uz", "vi", "cy", "xh", "yi", "yo", "zu",
] as const;

const HCAPTCHA_TABLE: VendorLocaleTable = { tags: tagTable(HCAPTCHA_TAGS) };

export function hcaptchaLocale(locale: string | null | undefined): string | undefined {
  return resolveVendorLocale(locale, HCAPTCHA_TABLE);
}

// ─── Cloudflare Turnstile (`language` / `data-language`) ──────────────────────

// Turnstile's only Spanish is `es` / `es-es`, so a LatAm visitor gets `es`.
// Codes are documented lowercase; `tlh` is the one 3-letter code.
const TURNSTILE_TAGS = [
  "auto", "ar", "ar-eg", "bg", "bg-bg", "cs", "cs-cz", "da", "da-dk", "de",
  "de-de", "el", "el-gr", "en", "en-us", "es", "es-es", "fa", "fa-ir", "fi",
  "fi-fi", "fr", "fr-fr", "he", "he-il", "hi", "hi-in", "hr", "hr-hr", "hu",
  "hu-hu", "id", "id-id", "it", "it-it", "ja", "ja-jp", "ko", "ko-kr", "lt",
  "lt-lt", "ms", "ms-my", "nb", "nb-no", "nl", "nl-nl", "pl", "pl-pl", "pt",
  "pt-br", "ro", "ro-ro", "ru", "ru-ru", "sk", "sk-sk", "sl", "sl-si", "sr",
  "sr-ba", "sv", "sv-se", "th", "th-th", "tl", "tl-ph", "tlh", "tr", "tr-tr",
  "uk", "uk-ua", "vi", "vi-vn", "zh", "zh-cn", "zh-tw",
] as const;

const TURNSTILE_TABLE: VendorLocaleTable = { tags: tagTable(TURNSTILE_TAGS) };

export function turnstileLocale(locale: string | null | undefined): string | undefined {
  return resolveVendorLocale(locale, TURNSTILE_TABLE);
}

// ─── Google Maps (`hl`) ───────────────────────────────────────────────────────

// Google DOES ship `es-419` (Spanish, Latin America). Note Hebrew is `iw`.
const GOOGLE_MAPS_TAGS = [
  "af", "sq", "am", "ar", "hy", "az", "eu", "be", "bn", "bs", "bg", "ca", "zh",
  "zh-CN", "zh-HK", "zh-TW", "hr", "cs", "da", "nl", "en", "en-AU", "en-GB",
  "et", "fa", "fi", "fil", "fr", "fr-CA", "gl", "ka", "de", "el", "gu", "iw",
  "hi", "hu", "is", "id", "it", "ja", "kn", "kk", "km", "ko", "ky", "lo", "lv",
  "lt", "mk", "ms", "ml", "mr", "mn", "ne", "no", "pl", "pt", "pt-BR", "pt-PT",
  "pa", "ro", "ru", "sr", "sr-Latn", "si", "sk", "sl", "es", "es-419", "sw",
  "sv", "ta", "te", "th", "tr", "uk", "ur", "uz", "vi", "zu",
] as const;

const GOOGLE_MAPS_TABLE: VendorLocaleTable = {
  tags: tagTable(GOOGLE_MAPS_TAGS),
  latamSpanish: "es-419",
};

export function googleMapsLocale(locale: string | null | undefined): string | undefined {
  return resolveVendorLocale(locale, GOOGLE_MAPS_TABLE);
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Append `key=value` to a URL's query string, but ONLY when the URL does not
 * already carry that key.
 *
 * Deliberately string-based, not `new URL()` + `URLSearchParams`. Google's
 * `maps/embed?pb=!1m18!1m12…` payload is full of `!` characters that
 * `URLSearchParams.toString()` would percent-encode, silently rewriting an
 * operator's pasted URL. Every existing parameter must survive byte for byte,
 * so we only ever concatenate.
 *
 * Returns the input unchanged when it is blank or already sets `key`.
 */
export function appendQueryParamIfAbsent(
  rawUrl: string,
  key: string,
  value: string,
): string {
  const url = rawUrl.trim();
  if (!url) return rawUrl;

  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const head = hashAt >= 0 ? url.slice(0, hashAt) : url;

  const queryAt = head.indexOf("?");
  const query = queryAt >= 0 ? head.slice(queryAt + 1) : "";
  if (query && new RegExp(`(^|&)${key}=`).test(query)) return rawUrl;

  const separator = queryAt >= 0 ? (query ? "&" : "") : "?";
  return `${head}${separator}${key}=${encodeURIComponent(value)}${hash}`;
}

/**
 * Add `hl=<language>` to a Google Maps URL (embed iframe, search link or
 * directions link) so the map labels and UI match the page, not the browser.
 *
 * Leaves the URL untouched when the locale maps to nothing Google supports, or
 * when the URL already sets `hl` — an operator who pasted a URL with their own
 * `hl` has made a deliberate choice and we do not overrule it.
 */
export function withGoogleMapsLanguage(
  rawUrl: string,
  locale: string | null | undefined,
): string {
  const hl = googleMapsLocale(locale);
  if (!hl) return rawUrl;
  return appendQueryParamIfAbsent(rawUrl, "hl", hl);
}
