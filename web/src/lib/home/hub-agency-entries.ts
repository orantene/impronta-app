/**
 * Hub landing agency entries, made safe for the environment (TUL-1843).
 *
 * `agency_domains` is copied between environments, so a staging row set holds
 * the tenants' LIVE custom domains (e.g. a studio's own `.com`). Listing them on
 * a staging hub sends testers to production sites. On a non-production root only
 * hosts under that root are listed (production-pattern `*.tulala.digital` hosts
 * are re-homed onto it); custom domains are suppressed. Production is unchanged.
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
): HubAgencyEntry[] {
  const root = resolvePublicRootDomain(env);
  const production = root === TULALA_APEX_HOST;
  const seen = new Set<string>();
  const out: HubAgencyEntry[] = [];
  for (const r of rows) {
    const hostname = rehomeToPublicRoot(r.hostname, env);
    if (!production && hostname !== root && !hostname.endsWith(`.${root}`)) continue;
    if (seen.has(hostname)) continue;
    seen.add(hostname);
    out.push({ hostname, name: (r.tenant_id && names.get(r.tenant_id)) || null });
  }
  return out;
}
