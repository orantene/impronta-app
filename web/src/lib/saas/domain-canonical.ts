import { isLocalPreviewHost, isStagingPreviewHost } from "./domain-display";

function isLegacyStudioBookingHost(hostname: string): boolean {
  return hostname.endsWith(".studiobooking.io");
}

export function resolveCanonicalCustomDomainRedirectHost(input: {
  currentHost: string;
  domainKind: "subdomain" | "custom" | "path";
  isPrimary: boolean;
  canonicalHost: string | null;
  canonicalHostKind?: "subdomain" | "custom" | null;
}): string | null {
  if (input.isPrimary) return null;

  const currentHost = input.currentHost.trim().toLowerCase();
  const canonicalHost = input.canonicalHost?.trim().toLowerCase() ?? "";
  const canonicalHostKind = input.canonicalHostKind ?? null;

  if (!currentHost || !canonicalHost || canonicalHost === currentHost) {
    return null;
  }

  if (isLocalPreviewHost(currentHost) || isLocalPreviewHost(canonicalHost)) {
    return null;
  }

  // L52: staging-*.tulala.digital hosts bypass canonical redirect so a
  // Phase-5-style launch gate can QA against a tenant's real data without
  // 308-bouncing to the tenant's canonical custom domain. Locked to the
  // .tulala.digital parent zone — see isStagingPreviewHost.
  if (isStagingPreviewHost(currentHost)) {
    return null;
  }

  if (input.domainKind === "custom") {
    return canonicalHost;
  }

  if (input.domainKind === "subdomain" && canonicalHostKind === "custom") {
    return canonicalHost;
  }

  // L8: Legacy .studiobooking.io hosts redirect to the tenant's primary host
  // when that primary is anything other than another .studiobooking.io domain.
  // This covers both custom domains and .tulala.digital subdomains as targets.
  if (
    isLegacyStudioBookingHost(currentHost) &&
    !isLegacyStudioBookingHost(canonicalHost)
  ) {
    return canonicalHost;
  }

  return null;
}
