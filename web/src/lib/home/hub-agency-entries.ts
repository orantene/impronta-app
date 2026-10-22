/**
 * Hub landing agency entries, made safe for the environment (TUL-1843).
 *
 * `agency_domains` is copied between environments, so a staging row set holds
 * the tenants' LIVE custom domains (e.g. a studio's own `.com`). Listing them on
 * a staging hub sends testers to production sites. On a non-production root only
 * hosts under that root are listed (production-pattern `*.tulala.digital` hosts
 * are re-homed onto it); a tenant with only custom domains is listed once at `<root>/w/<slug>`. Production is unchanged.
 */

import { rehomeToPublicRoot, resolvePublicRootDomain } from "@/lib/brand/public-root-domain";
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";

export type HubAgencyDomainRow = { hostname: string; kind: string; tenant_id?: string | null };
export type HubAgencyEntry = { hostname: string; name: string | null };

type Env = Readonly<Record<string, string | undefined>>;

export function buildHubAgencyEntries(
  rows: readonly HubAgencyDomainRow[],
  names: ReadonlyMap<string, string>,
  env: Env = process.env,
  slugs: ReadonlyMap<string, string> = new Map(),
): HubAgencyEntry[] {
  const root = resolvePublicRootDomain(env);
  const production = root === TULALA_APEX_HOST;
  const nameOf = (tenantId?: string | null) => (tenantId && names.get(tenantId)) || null;
  const seen = new Set<string>();
  const out: HubAgencyEntry[] = [];

  if (production) {
    for (const r of rows) {
      const hostname = rehomeToPublicRoot(r.hostname, env);
      if (seen.has(hostname)) continue;
      seen.add(hostname);
      out.push({ hostname, name: nameOf(r.tenant_id) });
    }
    return out;
  }

  // Non-production: ONE entry per tenant. Prefer a host already under this root
  // (re-homed); a tenant with only custom domains gets the path-hosted route
  // `<root>/w/<slug>`. A tenant with neither is not listed.
  const underRoot = (h: string) => h === root || h.endsWith(`.${root}`);
  const tenantEntry = new Map<string, string>();
  const order: string[] = [];
  for (const r of rows) {
    const key = r.tenant_id ?? `host:${r.hostname}`;
    if (!tenantEntry.has(key) && !order.includes(key)) order.push(key);
    const hostname = rehomeToPublicRoot(r.hostname, env);
    if (underRoot(hostname) && !tenantEntry.has(key)) tenantEntry.set(key, hostname);
  }
  for (const key of order) {
    const tenantId = key.startsWith("host:") ? null : key;
    let hostname = tenantEntry.get(key) ?? null;
    const slug = tenantId ? slugs.get(tenantId) : undefined;
    if (!hostname && slug) hostname = `${root}/w/${slug}`;
    if (!hostname || seen.has(hostname)) continue;
    seen.add(hostname);
    out.push({ hostname, name: nameOf(tenantId) });
  }
  return out;
}
