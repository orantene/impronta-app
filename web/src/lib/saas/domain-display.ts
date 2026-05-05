import { isLikelyApexCustomDomain } from "./custom-domain-routing";

type DomainHostRow = {
  hostname: string;
};

type PrimaryAwareDomainHostRow = DomainHostRow & {
  isPrimary: boolean;
};

export type DomainAliasRedirectMode = "bare_to_www" | "www_to_bare";

export type CustomDomainAliasRedirect<T extends PrimaryAwareDomainHostRow> = {
  baseHostname: string;
  primaryDomain: T;
  alternateDomain: T;
  mode: DomainAliasRedirectMode;
};

export function isLocalPreviewHost(hostname: string): boolean {
  return /\.local$/i.test(hostname) || /\.lvh\.me$/i.test(hostname);
}

export function isLegacyBrandedHost(hostname: string): boolean {
  return /\.studiobooking\.io$/i.test(hostname);
}

export function filterOperatorFacingCustomDomains<T extends DomainHostRow>(rows: T[]): T[] {
  const visible = rows.filter((row) => !isLocalPreviewHost(row.hostname));
  return visible.length > 0 ? visible : rows;
}

export function filterOperatorFacingSubdomains<T extends DomainHostRow>(rows: T[]): T[] {
  const nonLocal = rows.filter((row) => !isLocalPreviewHost(row.hostname));
  const preferred = nonLocal.filter((row) => !isLegacyBrandedHost(row.hostname));

  if (preferred.length > 0) return preferred;
  if (nonLocal.length > 0) return nonLocal;
  return rows;
}

function normalizeDomainHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function resolveAliasBaseHostname(hostname: string): string | null {
  const normalized = normalizeDomainHostname(hostname);
  if (!normalized) return null;

  if (isLikelyApexCustomDomain(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("www.")) {
    const bareHostname = normalized.slice(4);
    if (bareHostname && isLikelyApexCustomDomain(bareHostname)) {
      return bareHostname;
    }
  }

  return null;
}

export function findPrimaryCustomDomain<T extends PrimaryAwareDomainHostRow>(rows: T[]): T | null {
  return rows.find((row) => row.isPrimary) ?? null;
}

export function listAlternateCustomDomains<T extends PrimaryAwareDomainHostRow>(rows: T[]): T[] {
  return rows.filter((row) => !row.isPrimary);
}

export function suggestAlternateCustomDomainHostname<T extends PrimaryAwareDomainHostRow>(
  rows: T[],
): string | null {
  const primary = findPrimaryCustomDomain(rows);
  if (!primary) return null;

  const primaryHostname = normalizeDomainHostname(primary.hostname);
  if (!primaryHostname) return null;

  let suggestion: string | null = null;
  if (isLikelyApexCustomDomain(primaryHostname)) {
    suggestion = `www.${primaryHostname}`;
  } else if (primaryHostname.startsWith("www.")) {
    const bareHostname = primaryHostname.slice(4);
    if (bareHostname && isLikelyApexCustomDomain(bareHostname)) {
      suggestion = bareHostname;
    }
  }

  if (!suggestion) return null;

  const normalizedHosts = new Set(rows.map((row) => normalizeDomainHostname(row.hostname)));
  return normalizedHosts.has(suggestion) ? null : suggestion;
}

export function resolveCustomDomainAliasRedirect<T extends PrimaryAwareDomainHostRow>(
  rows: T[],
): CustomDomainAliasRedirect<T> | null {
  const primaryDomain = findPrimaryCustomDomain(rows);
  if (!primaryDomain) return null;

  const primaryHostname = normalizeDomainHostname(primaryDomain.hostname);
  const baseHostname = resolveAliasBaseHostname(primaryHostname);
  if (!baseHostname) return null;

  const primaryIsWww = primaryHostname.startsWith("www.");
  const alternateHostname = primaryIsWww ? baseHostname : `www.${baseHostname}`;
  const alternateDomain = rows.find(
    (row) => normalizeDomainHostname(row.hostname) === alternateHostname,
  );

  if (!alternateDomain) return null;

  return {
    baseHostname,
    primaryDomain,
    alternateDomain,
    mode: primaryIsWww ? "bare_to_www" : "www_to_bare",
  };
}
