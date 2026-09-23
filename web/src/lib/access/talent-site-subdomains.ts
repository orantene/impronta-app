/**
 * Switch for talent personal-site SUBDOMAINS (`<name>.tulala.digital`).
 *
 * Mirrors `talent-site-tier-expansion.ts`, with the polarity reversed: this one
 * defaults OFF. Until it is explicitly turned on, host resolution and every
 * emitted site URL must behave exactly as they do today (`/t/site/<slug>`), so
 * the phase can ship dark and be flipped from the environment.
 */
export function isTalentSiteSubdomainsEnabled(): boolean {
  return process.env.TALENT_SITE_SUBDOMAINS_ENABLED === "true";
}
