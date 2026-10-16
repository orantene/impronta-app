/**
 * The talent promo badge on a directory card (TUL-1051 part C). Framework-free
 * so the card (client) and the loader (server) share one type and one rule.
 */

export type TalentPromoBadge = {
  /** "-20%" / "Gratis: ..." from the same copy the price badge uses. */
  label: string;
  /** One short line (the promo's own title), or null. */
  line: string | null;
  promoId: string;
};

/**
 * Hub vs agency: a directory with no tenant scope IS the Tulala hub marketplace
 * (`directorySurfaceFromTenantId(null)` is `{ kind: "hub" }`); any tenant scope
 * is an agency or exclusive-agency site. Hub: always. Agency: only when its
 * Card Design opts in (default off).
 */
export function shouldShowTalentPromoBadges(input: { tenantScopeId: string | null; agencyOptIn: boolean }): boolean {
  return input.tenantScopeId === null || input.agencyOptIn === true;
}
