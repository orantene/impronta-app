/**
 * Kill switch for talent personal-site tier expansion (Free/Pro publish).
 * When disabled, only Max retains edit/publish (legacy behavior).
 */
export function isTalentSiteTierExpansionEnabled(): boolean {
  if (process.env.TALENT_SITE_TIER_EXPANSION_DISABLED === "true") {
    return false;
  }
  return true;
}
