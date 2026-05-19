export type DomainRoutingRecord = {
  type: "A" | "CNAME";
  host: string;
  value: string;
};

export const VERCEL_APEX_A_RECORD = "76.76.21.21";
export const VERCEL_GENERAL_CNAME_TARGET = "cname.vercel-dns-0.com";
export const VERCEL_ACCEPTED_CNAME_TARGETS = [
  VERCEL_GENERAL_CNAME_TARGET,
  "cname.vercel-dns.com",
] as const;

// TODO: Replace with the `psl` package when public-suffix coverage matters more than bundle size.
const KNOWN_SECOND_LEVEL_PUBLIC_SUFFIXES = new Set([
  "ac.uk",
  "co.id",
  "co.il",
  "co.in",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.th",
  "co.uk",
  "co.za",
  "com.ar",
  "com.au",
  "com.br",
  "com.cn",
  "com.hk",
  "com.mx",
  "com.sg",
  "com.tr",
  "com.tw",
  "gov.uk",
  "me.uk",
  "net.au",
  "net.nz",
  "nhs.uk",
  "org.au",
  "org.nz",
  "org.uk",
  "co.nz",
]);

function zoneLabelCount(hostname: string): number {
  const labels = hostname.trim().toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return Math.min(labels.length, 2);
  const suffix = labels.slice(-2).join(".");
  return KNOWN_SECOND_LEVEL_PUBLIC_SUFFIXES.has(suffix) ? 3 : 2;
}

export function isLikelyApexCustomDomain(hostname: string): boolean {
  const labels = hostname.trim().toLowerCase().split(".").filter(Boolean);
  return labels.length === zoneLabelCount(hostname);
}

export function buildCustomDomainRoutingRecords(hostname: string): DomainRoutingRecord[] {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return [];

  if (isLikelyApexCustomDomain(normalized)) {
    return [
      {
        type: "A",
        host: "@",
        value: VERCEL_APEX_A_RECORD,
      },
    ];
  }

  const labels = normalized.split(".").filter(Boolean);
  const host = labels.slice(0, labels.length - zoneLabelCount(normalized)).join(".");
  return host
    ? [
        {
          type: "CNAME",
          host,
          value: VERCEL_GENERAL_CNAME_TARGET,
        },
      ]
    : [];
}

export function normalizeDnsComparableValue(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

// SECURITY: the registrable domain MUST be `vercel-dns.com` or
// `vercel-dns-<n>.com` (Vercel's real CNAME zones). Anchored end-to-end so the
// only labels allowed before it are sub-labels OF that zone. This rejects the
// old `includes("vercel-dns")` bypass class — `vercel-dns.attacker.com`
// (zone=attacker.com), `not-vercel-dns.evil.io` (zone=evil.io),
// `x.vercel-dns.example.com` (zone=example.com) — none of which Vercel
// controls — while still accepting `cname.vercel-dns.com`,
// `cname.vercel-dns-0.com`, and the bare apex `vercel-dns.com`.
const VERCEL_DNS_CNAME_PATTERN = /^([a-z0-9-]+\.)*vercel-dns(-\d+)?\.com$/;

export function isAcceptedVercelCname(value: string): boolean {
  const normalized = normalizeDnsComparableValue(value);
  if (
    VERCEL_ACCEPTED_CNAME_TARGETS.includes(
      normalized as (typeof VERCEL_ACCEPTED_CNAME_TARGETS)[number],
    )
  ) {
    return true;
  }
  return VERCEL_DNS_CNAME_PATTERN.test(normalized);
}

export function customDomainCanBecomePrimary(status: string | null): boolean {
  return status === "active";
}

export function customDomainNeedsRouting(status: string | null): boolean {
  return status === "verified" || status === "ssl_provisioned";
}
