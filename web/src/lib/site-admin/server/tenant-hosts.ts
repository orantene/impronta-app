/**
 * Resolve a tenant's public storefront origin for admin previews.
 *
 * Source of truth is `agency_domains` (kind='subdomain' or 'custom',
 * status active-ish). Multiple hosts per tenant are allowed. In
 * production we prefer the current primary domain; in local dev we
 * still favor dev-routable hosts like `.local` / `.lvh.me` so "View
 * live" keeps opening a reachable storefront even when the true primary
 * host is a real custom domain outside the local machine.
 *
 * In dev the Next.js server listens on port 3000 and the middleware
 * routes by Host header, so `http://midnight.lvh.me:3000` Just Works.
 * In production the origin is `https://<hostname>` with no port.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveWorkspacePublicAddress,
  type WorkspaceUrlPlan,
} from "@/lib/saas/workspace-public-url";

type DomainRow = {
  hostname: string;
  kind: string;
  status: string;
  is_primary?: boolean | null;
};

type PreviewDomainKind = "subdomain" | "custom";
type PreviewDomainRow = {
  hostname: string;
  kind: PreviewDomainKind;
  status: string;
  isPrimary?: boolean | null;
};

const READY_STATUSES = ["active", "ssl_provisioned", "verified"] as const;
const LOCAL_DEV_ORIGIN = "http://localhost:3000";

const KNOWN_WORKSPACE_URL_PLANS = new Set<WorkspaceUrlPlan>([
  "free",
  "studio",
  "agency",
  "network",
  "legacy",
]);

function isDevPreviewHost(host: string): boolean {
  return /\.lvh\.me$/i.test(host) || /\.local$/i.test(host);
}

function normalizeWorkspaceUrlPlan(plan: string | null | undefined): WorkspaceUrlPlan {
  if (plan && KNOWN_WORKSPACE_URL_PLANS.has(plan as WorkspaceUrlPlan)) {
    return plan as WorkspaceUrlPlan;
  }
  return "free";
}

function workspacePathPreviewUrl(slug: string, options?: { isDev?: boolean }): string {
  const isDev = options?.isDev ?? process.env.NODE_ENV !== "production";
  const base = isDev ? LOCAL_DEV_ORIGIN : "https://tulala.digital";
  return `${base}/${slug}`;
}

function kindRank(kind: string): number {
  // Prefer custom → subdomain → anything else.
  if (kind === "custom") return 0;
  if (kind === "subdomain") return 1;
  return 2;
}

function primaryRank(row: DomainRow): number {
  return row.is_primary ? 0 : 1;
}

function statusRank(status: string): number {
  const index = READY_STATUSES.indexOf(
    status as (typeof READY_STATUSES)[number],
  );
  return index === -1 ? READY_STATUSES.length : index;
}

function previewHostRank(host: string): number {
  return isDevPreviewHost(host) ? 0 : 1;
}

function isEligiblePreviewDomain(row: DomainRow): boolean {
  return (
    typeof row.hostname === "string" &&
    row.hostname.trim().length > 0 &&
    READY_STATUSES.includes(row.status as (typeof READY_STATUSES)[number]) &&
    (row.kind === "custom" || row.kind === "subdomain")
  );
}

export function pickPreferredTenantPreviewHost(
  rows: DomainRow[] | PreviewDomainRow[],
  options?: { isDev?: boolean },
): string | null {
  const isDev = options?.isDev ?? process.env.NODE_ENV !== "production";
  const ranked = rows
    .filter(isEligiblePreviewDomain)
    .slice()
    .sort((a, b) => {
      if (isDev) {
        const preview = previewHostRank(a.hostname) - previewHostRank(b.hostname);
        if (preview !== 0) return preview;
      }

      const primary = primaryRank(a) - primaryRank(b);
      if (primary !== 0) return primary;

      const status = statusRank(a.status) - statusRank(b.status);
      if (status !== 0) return status;

      const kind = kindRank(a.kind) - kindRank(b.kind);
      if (kind !== 0) return kind;

      if (!isDev) {
        const preview = previewHostRank(a.hostname) - previewHostRank(b.hostname);
        if (preview !== 0) return preview;
      }

      return a.hostname.localeCompare(b.hostname);
    });

  return ranked[0]?.hostname ?? null;
}

export function tenantPreviewOriginFromHostname(
  hostname: string | null,
  options?: { isDev?: boolean },
): string | null {
  if (!hostname) return null;
  const isDev = options?.isDev ?? process.env.NODE_ENV !== "production";
  const scheme = isDev ? "http" : "https";
  const port = isDev ? ":3000" : "";
  return `${scheme}://${hostname}${port}`;
}

export function resolveWorkspacePreviewUrl(input: {
  slug: string;
  plan: WorkspaceUrlPlan;
  primaryHost: string | null;
  primaryHostKind: "subdomain" | "custom" | null;
  subdomainHost: string | null;
  domainRows: PreviewDomainRow[];
  isDev?: boolean;
}): string {
  const isDev = input.isDev ?? process.env.NODE_ENV !== "production";
  const publicAddress = resolveWorkspacePublicAddress({
    slug: input.slug,
    plan: input.plan,
    domainState: {
      primaryHost: input.primaryHost,
      primaryHostKind: input.primaryHostKind,
      subdomainHost: input.subdomainHost,
    },
  });

  if (!isDev) {
    return publicAddress.primaryUrl;
  }

  if (publicAddress.primaryKind === "path") {
    return workspacePathPreviewUrl(input.slug, { isDev });
  }

  const previewHost = pickPreferredTenantPreviewHost(input.domainRows, { isDev });
  if (previewHost && isDevPreviewHost(previewHost)) {
    return tenantPreviewOriginFromHostname(previewHost, { isDev })
      ?? workspacePathPreviewUrl(input.slug, { isDev });
  }

  return workspacePathPreviewUrl(input.slug, { isDev });
}

export async function getTenantPreviewUrl(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const [{ data: agency, error: agencyError }, { data: domains, error: domainsError }] = await Promise.all([
    supabase
      .from("agencies")
      .select("slug, plan_tier")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("agency_domains")
      .select("hostname, kind, status, is_primary")
      .eq("tenant_id", tenantId)
      .in("kind", ["custom", "subdomain"]),
  ]);

  if (agencyError || !agency?.slug) return null;
  if (domainsError) return null;

  const rows = (domains ?? []) as DomainRow[];
  const subdomains = rows.filter((row) => row.kind === "subdomain");
  const customs = rows.filter((row) => row.kind === "custom");

  const preferredSubdomain =
    subdomains.find((row) => row.is_primary)
    ?? subdomains.find((row) => row.hostname.endsWith(".tulala.digital"))
    ?? subdomains.find((row) => row.hostname.endsWith(".lvh.me"))
    ?? subdomains.find((row) => row.hostname.endsWith(".local"))
    ?? subdomains[0]
    ?? null;
  const custom =
    customs.find((row) => row.is_primary)
    ?? customs[0]
    ?? null;
  const primary =
    rows.find((row) => row.is_primary)
    ?? custom
    ?? preferredSubdomain
    ?? null;

  return resolveWorkspacePreviewUrl({
    slug: agency.slug,
    plan: normalizeWorkspaceUrlPlan(agency.plan_tier),
    primaryHost: primary?.hostname ?? null,
    primaryHostKind:
      primary?.kind === "custom" || primary?.kind === "subdomain"
        ? primary.kind
        : null,
    subdomainHost: preferredSubdomain?.hostname ?? null,
    domainRows: [
      ...subdomains.map((row) => ({
        hostname: row.hostname,
        kind: "subdomain" as const,
        status: row.status,
        isPrimary: row.is_primary,
      })),
      ...customs.map((row) => ({
        hostname: row.hostname,
        kind: "custom" as const,
        status: row.status,
        isPrimary: row.is_primary,
      })),
    ],
  });
}
