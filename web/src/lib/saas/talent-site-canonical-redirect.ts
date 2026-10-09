/**
 * Talent host → primary custom-domain 308 decision.
 *
 * Reuses the SAME agency helper (`resolveCanonicalCustomDomainRedirectHost`)
 * so apex↔www and subdomain→custom stay one code path. Returns the hostname
 * to 308 to, or null when the request should be served in place.
 *
 * Never redirects when there is no ACTIVE primary custom domain (canonicalHost
 * null / isPrimary): a DNS break or pending verify must not bounce visitors.
 */
import { resolveCanonicalCustomDomainRedirectHost } from "./domain-canonical";

export type TalentSiteCanonicalRedirectInput = {
  hostname: string;
  hostKind: "subdomain" | "custom";
  isPrimary: boolean;
  canonicalHost: string | null;
  canonicalHostKind: "subdomain" | "custom" | null;
};

export function resolveTalentSiteCanonicalRedirectHost(
  input: TalentSiteCanonicalRedirectInput,
): string | null {
  return resolveCanonicalCustomDomainRedirectHost({
    currentHost: input.hostname,
    domainKind: input.hostKind,
    isPrimary: input.isPrimary,
    canonicalHost: input.canonicalHost,
    canonicalHostKind: input.canonicalHostKind,
  });
}

/**
 * Map RPC row fields onto the agency-shaped canonical redirect inputs.
 * Missing columns (pre-migration RPC) degrade to "serve in place".
 */
export function talentSiteCanonicalFieldsFromLookup(input: {
  hostname: string;
  hostKind: "subdomain" | "custom";
  /** Custom-domain RPC: explicit primary flag. Absent → no redirect. */
  isPrimary?: boolean | null;
  /** Custom-domain RPC: profile's active primary host. */
  primaryDomain?: string | null;
  /** Subdomain RPC: active primary custom host, if any. */
  primaryCustomDomain?: string | null;
}): Pick<
  TalentSiteCanonicalRedirectInput,
  "isPrimary" | "canonicalHost" | "canonicalHostKind"
> {
  const hostname = input.hostname.trim().toLowerCase();

  if (input.hostKind === "subdomain") {
    const primary = (input.primaryCustomDomain ?? "").trim().toLowerCase();
    if (primary && primary !== hostname) {
      return {
        isPrimary: false,
        canonicalHost: primary,
        canonicalHostKind: "custom",
      };
    }
    return { isPrimary: true, canonicalHost: null, canonicalHostKind: null };
  }

  // Custom host: only redirect when the RPC explicitly says non-primary AND
  // names a different active primary. Pre-migration rows omit is_primary →
  // serve in place (dark-safe).
  if (input.isPrimary === false) {
    const primary = (input.primaryDomain ?? "").trim().toLowerCase();
    if (primary && primary !== hostname) {
      return {
        isPrimary: false,
        canonicalHost: primary,
        canonicalHostKind: "custom",
      };
    }
  }

  return { isPrimary: true, canonicalHost: null, canonicalHostKind: null };
}
