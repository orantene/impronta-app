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

export function isAcceptedVercelCname(value: string): boolean {
  const normalized = normalizeDnsComparableValue(value);
  return (
    VERCEL_ACCEPTED_CNAME_TARGETS.includes(normalized as (typeof VERCEL_ACCEPTED_CNAME_TARGETS)[number]) ||
    normalized.includes("vercel-dns")
  );
}

export function customDomainCanBecomePrimary(status: string | null): boolean {
  return status === "active";
}

export function customDomainNeedsRouting(status: string | null): boolean {
  return status === "verified" || status === "ssl_provisioned";
}
