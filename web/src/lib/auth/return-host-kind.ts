/**
 * return-host-kind.ts — classify a host a post-auth return / SSO hand-off may
 * target (TUL-691). Pure: every lookup is injected so tests need no database.
 *
 *   agency            agency_domains row on a platform host (shares cookies)
 *   agency_custom     agency_domains row with kind "custom" (host-only cookies)
 *   talent_custom     live talent custom domain (talent_site_domain_lookup)
 *   talent_subdomain  live `<slug>.tulala.digital` talent site (shares cookies)
 *
 * Fails closed: an empty host, a thrown lookup, or no match is `null`.
 */

export type ReturnHostKind =
  | "agency"
  | "agency_custom"
  | "talent_custom"
  | "talent_subdomain";

export type ReturnHostLookups = {
  /** `kind` of an ACTIVE agency_domains row for the host, or null. */
  agencyDomainKind: (host: string) => Promise<string | null>;
  /** True when the host is a live (active + published) talent custom domain. */
  isLiveTalentCustomDomain: (host: string) => Promise<boolean>;
  /** True when the host is a live talent subdomain. */
  isLiveTalentSubdomain: (host: string) => Promise<boolean>;
  /** TALENT_SITE_SUBDOMAINS_ENABLED; off means subdomains are never trusted. */
  talentSubdomainsEnabled: boolean;
};

export function normalizeReturnHost(host: string): string {
  return (host.split(":")[0] ?? "").trim().toLowerCase();
}

export async function classifyReturnHost(
  rawHost: string,
  lookups: ReturnHostLookups,
): Promise<ReturnHostKind | null> {
  const host = normalizeReturnHost(rawHost);
  if (!host) return null;
  try {
    const agencyKind = await lookups.agencyDomainKind(host);
    if (agencyKind) return agencyKind === "custom" ? "agency_custom" : "agency";
    if (await lookups.isLiveTalentCustomDomain(host)) return "talent_custom";
    if (lookups.talentSubdomainsEnabled && (await lookups.isLiveTalentSubdomain(host))) {
      return "talent_subdomain";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Custom domains keep host-only auth cookies, so a session reaches them only
 * through the one-time SSO hand-off. Platform hosts share the cookie domain.
 */
export function isSsoHandoffHostKind(kind: ReturnHostKind | null): boolean {
  return kind === "agency_custom" || kind === "talent_custom";
}
