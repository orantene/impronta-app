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
 * Same-origin `/talent` path guard for the seed route's `next` parameter.
 * Anything else (absolute URLs, protocol-relative, backslashes, other
 * surfaces) collapses to `/talent/today`.
 */
export function safeTalentNextPath(next: string | null | undefined): string {
  const fallback = "/talent/today";
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(next, "http://seed.invalid");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://seed.invalid") return fallback;
  if (parsed.pathname !== "/talent" && !parsed.pathname.startsWith("/talent/")) return fallback;
  return `${parsed.pathname}${parsed.search}`;
}

/** Build the seed route URL that returns the talent to `next`. */
export function talentLocaleSeedHref(next: string): string {
  return `${TALENT_LOCALE_SEED_ROUTE}?next=${encodeURIComponent(safeTalentNextPath(next))}`;
}
