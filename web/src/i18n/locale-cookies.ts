/**
 * locale-cookies.ts — cookie names and serialization for the locale system.
 *
 * A LEAF module: it imports nothing, on purpose. `locale-middleware.ts` pulls
 * in `next/server` (so it can never reach a client bundle) and
 * `locale-suggestion.ts` imports `locale-middleware`. Putting the shared
 * constant in either of them would either break the client build or create an
 * import cycle between two modules that both export consts — and a const read
 * across an ESM cycle is a TDZ crash at chunk evaluation, which no gate in this
 * repo catches (see incident_card_design_token_keys_tdz_cycle). A leaf with
 * zero imports cannot participate in a cycle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `locale_auto` EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `syncLocaleCookieForPath` writes `locale=<defaultLocale>` on a fresh
 * visitor's FIRST public response, with a 400-day expiry. Verified live:
 *
 *   curl -sI -L https://improntamodels.com/  ->  set-cookie: locale=en; Max-Age=34560000
 *   curl -sI -L https://tulala.digital/      ->  set-cookie: locale=en; Max-Age=34560000
 *
 * Nobody chose that. It is bookkeeping. But by value it is identical to the
 * cookie an operator gets after deliberately clicking ES in the language
 * switcher, and the language suggestion banner has to tell those two apart:
 * a deliberate choice must silence the banner forever, while bookkeeping must
 * not silence it at all. Without this marker the banner is a one-shot that
 * disappears the moment the visitor clicks any link before deciding — which,
 * for an EN-default tenant whose audience is largely Spanish-speaking, means
 * the feature does not work.
 *
 * THE CONTRACT (every writer of `locale` must satisfy exactly one branch):
 *
 *   AUTO      write `locale` AND set `locale_auto=1`.
 *             Exactly one writer qualifies: the `isUnprefixedPublicDefaultPath`
 *             branch of `syncLocaleCookieForPath`.
 *
 *   DELIBERATE write `locale` AND clear `locale_auto`.
 *             Everything else: the public language switcher (which persists
 *             through the non-default-prefix branch of the same function), the
 *             dashboard locale toggles, `redirectToLocaleEquivalent`, and the
 *             suggestion banner's own accept action.
 *
 * A new writer that does neither inherits the DELIBERATE reading (`locale`
 * present, no marker), which fails safe: the banner goes quiet rather than
 * nagging someone who already chose. Silence is the recoverable failure here.
 */

/** Companion marker: "the `locale` cookie next to me was written by machinery, not by a person." */
export const LOCALE_AUTO_COOKIE = "locale_auto";

/** ~13 months. The locale cookie and its marker must expire together or the marker outlives its subject. */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export type LocaleCookieWriteOptions = {
  maxAgeSeconds?: number;
  secure?: boolean;
};

/**
 * A `document.cookie` / `Set-Cookie` payload for the locale family.
 *
 * Client components cannot import `localeCookieOptions` from
 * `locale-middleware.ts` (it ships `next/server`), so this is the one
 * serializer both halves of the app use. Attributes are kept byte-compatible
 * with `localeCookieOptions`: path `/`, SameSite Lax, Secure in production.
 */
export function localeCookieLine(
  name: string,
  value: string,
  options?: LocaleCookieWriteOptions,
): string {
  const maxAge = options?.maxAgeSeconds ?? LOCALE_COOKIE_MAX_AGE_SECONDS;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${maxAge}`,
    "samesite=lax",
  ];
  if (options?.secure) parts.push("secure");
  return parts.join("; ");
}

/**
 * The `document.cookie` payload that DELETES the auto marker.
 *
 * `max-age=0` with the same path is the only reliable client-side delete; a
 * differing path silently creates a second cookie instead of removing the
 * first, which would leave the marker readable and the banner nagging a
 * visitor who just made a choice.
 */
export function clearLocaleAutoMarkerLine(secure: boolean): string {
  return localeCookieLine(LOCALE_AUTO_COOKIE, "", { maxAgeSeconds: 0, secure });
}
