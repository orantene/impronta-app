/**
 * Resolve a tenant's public storefront origin for admin previews.
 *
 * Source of truth is `agency_domains` (kind='subdomain' or 'vanity',
 * status active). Multiple hosts per tenant are allowed; we prefer a
 * `vanity` custom domain over a default subdomain, and within the same
 * kind we prefer `.local` / production-shaped hostnames over dev
 * `.lvh.me` conveniences unless we're clearly running in dev.
 *
 * In dev the Next.js server listens on port 3000 and the middleware
 * routes by Host header, so `http://midnight.lvh.me:3000` Just Works.
 * In production the origin is `https://<hostname>` with no port.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type DomainRow = {
  hostname: string;
  kind: string;
  status: string;
};

function isLvhHost(host: string): boolean {
  return /\.lvh\.me$/i.test(host);
}

function kindRank(kind: string): number {
  // Prefer vanity → subdomain → anything else.
  if (kind === "vanity") return 0;
  if (kind === "subdomain") return 1;
  return 2;
}

function hostnameRank(host: string): number {
  // Prefer non-.lvh.me in prod, prefer .lvh.me in dev.
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) return isLvhHost(host) ? 0 : 1;
  return isLvhHost(host) ? 1 : 0;
}

export async function getTenantPreviewOrigin(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agency_domains")
    .select("hostname, kind, status")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "ssl_provisioned", "verified"])
    .in("kind", ["vanity", "subdomain"]);
  if (error || !data || data.length === 0) return null;

  const rows = (data as DomainRow[]).slice().sort((a, b) => {
    const k = kindRank(a.kind) - kindRank(b.kind);
    if (k !== 0) return k;
    const h = hostnameRank(a.hostname) - hostnameRank(b.hostname);
    if (h !== 0) return h;
    return a.hostname.localeCompare(b.hostname);
  });

  const best = rows[0];
  const isDev = process.env.NODE_ENV !== "production";
  const scheme = isDev ? "http" : "https";
  // Dev server runs on port 3000 and routes by Host header; dev proxies
  // on 3102/3106 simply forward there. The direct :3000 origin is the
  // one we can always reach from the admin browser.
  const port = isDev ? ":3000" : "";
  return `${scheme}://${best.hostname}${port}`;
}
