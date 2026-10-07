/**
 * Talent dashboard locale seeding, pure decisions (2026-09-29).
 *
 * The dashboard renders in the `locale` cookie (dashboard paths carry no
 * locale prefix). A talent whose primary language differs from that cookie
 * should see their primary, UNLESS they deliberately chose a language: a
 * cookie without the `locale_auto` marker is a person's choice and is never
 * overwritten. See `@/i18n/locale-cookies` for the AUTO/DELIBERATE contract.
 */

export const TALENT_LOCALE_SEED_ROUTE = "/api/talent/locale-seed";

/**
 * Loop breaker: the seed route always sets this short-lived cookie, and the
 * layout never redirects while it is present. If a seed could not be written
 * (session drift between layout and route), the talent lands on the page in
 * the current language instead of bouncing.
 */
export const TALENT_LOCALE_SEED_ATTEMPT_COOKIE = "talent_locale_seed_attempt";
export const TALENT_LOCALE_SEED_ATTEMPT_MAX_AGE_SECONDS = 60;

/**
 * Returns the locale to seed, or null when nothing should change:
 *   - cookie deliberate (present, no auto marker)  -> null
 *   - cookie already equals the primary             -> null
 *   - cookie absent or auto and differs             -> primary
 */
export function talentLocaleSeedTarget(input: {
  cookieLocale: string | null | undefined;
  cookieIsAuto: boolean;
  primary: string;
}): string | null {
  const current = input.cookieLocale?.trim() || null;
  if (current && !input.cookieIsAuto) return null;
  if (current === input.primary) return null;
  return input.primary;
}

/**
 * F132 - what the talent surface should write for THIS signed-in user.
 *
 * The `locale` cookie is per browser, so a platform admin's deliberate English
 * made Valeria (preferred_locale es) see English. A cookie only counts as the
 * talent's own choice when its owner stamp equals her user id. Otherwise it is
 * foreign: re-seed her primary (marked auto) and stamp her as owner, so her
 * own later switch is honoured and nobody else's ever is.
 *   - `primary` null (degraded read)  -> nothing, never guess
 *   - owner is this user              -> the existing deliberate/auto rule
 *   - owner absent or someone else    -> primary + stamp
 */
export function talentLocaleSeedPlan(input: {
  cookieLocale: string | null | undefined;
  cookieIsAuto: boolean;
  cookieOwner: string | null | undefined;
  userId: string;
  primary: string | null | undefined;
}): { locale: string | null; stamp: boolean } {
  if (!input.primary) return { locale: null, stamp: false };
  if (!input.userId || input.cookieOwner !== input.userId) {
    return { locale: input.primary, stamp: true };
  }
  return {
    locale: talentLocaleSeedTarget({
      cookieLocale: input.cookieLocale,
      cookieIsAuto: input.cookieIsAuto,
      primary: input.primary,
    }),
    stamp: false,
  };
}

/**
 * True when `talentLocaleSeedPlan` could write anything for this cookie state,
 * whatever the primary turns out to be: false only for a deliberate cookie the
 * signed-in user owns. Lets a caller skip reading the stored language at all.
 */
export function localeSeedMayApply(input: {
  cookieLocale: string | null | undefined;
  cookieIsAuto: boolean;
  cookieOwner: string | null | undefined;
  userId: string;
}): boolean {
  if (!input.userId) return false;
  if (input.cookieOwner !== input.userId) return true;
  return !input.cookieLocale?.trim() || input.cookieIsAuto;
}

/** Dashboard routes the seed hop may run on. Everything else (template-preview, public sites) is excluded. */
export function isLocaleSeedablePath(pathname: string | null | undefined): boolean {
  if (!pathname || typeof pathname !== "string") return false;
  return pathname === "/talent" || pathname.startsWith("/talent/");
}

/**
 * Same-origin relative return-URL guard for the seed route's `next` parameter.
 * Parses with `new URL()` against a sentinel origin (never trusts a bare
 * `startsWith("/")`), rejects absolute, protocol-relative, backslash and
 * control-character forms and the seed route itself (loop), and otherwise
 * returns the EXACT original path + query so the hop is invisible. Invalid
 * input collapses to `/talent/today`.
 */
export function safeTalentNextPath(next: string | null | undefined): string {
  const fallback = "/talent/today";
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(next, "http://seed.invalid");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://seed.invalid") return fallback;
  if (parsed.pathname === TALENT_LOCALE_SEED_ROUTE || parsed.pathname.startsWith(`${TALENT_LOCALE_SEED_ROUTE}/`)) {
    return fallback;
  }
  return `${parsed.pathname}${parsed.search}`;
}

/** Build the seed route URL that returns the visitor to `next`. */
export function talentLocaleSeedHref(next: string): string {
  return `${TALENT_LOCALE_SEED_ROUTE}?next=${encodeURIComponent(safeTalentNextPath(next))}`;
}
