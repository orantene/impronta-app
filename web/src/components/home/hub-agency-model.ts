/**
 * TUL-1884: which agencies the hub home lists, and how many show before "see all".
 * Pure so a test pins it; the server loader and the client list share it.
 *
 * Public means: a site domain (custom/subdomain) of an `agency`-kind workspace with a published
 * homepage, one card per workspace, a live workspace (not draft/archived/suspended/cancelled), one that has not opted out
 * of Discover, with a real name, and not a seed/test/demo workspace. There is no `is_test` column on
 * `agencies`, so test data is recognised by its explicit settings flags and by the seed host pattern
 * (`qa-1`, `e2e-*`, `seed-*`, `test-*`, `demo-*`).
 */
export type HubAgencyItem = { hostname: string; name: string | null };

export type HubAgencyCandidate = {
  /** The workspace this domain belongs to; one card per tenant. */
  tenantId?: string | null;
  /** agency_domains.kind: only site domains (subdomain, custom) are listed. */
  domainKind?: string | null;
  /** agencies.kind: 'agency' only. The hub/platform tenant is excluded by kind, never by name. */
  agencyKind?: string | null;
  /**
   * The listing bar for test workspaces: `agencies` has no reliable test flag, so a workspace must
   * have a PUBLISHED homepage (cms_pages published, system homepage) to appear on the hub.
   */
  hasPublishedHomepage?: boolean;
  /** True when the workspace has an owner membership and at least one owner is not a test account. */
  hasRealOwner?: boolean;
  hostname: string;
  name: string | null;
  status?: string | null;
  discoverExposureEnabled?: boolean | null;
  settings?: Record<string, unknown> | null;
};

/** How many cards show before the "see all" control. */
export const HUB_AGENCY_PREVIEW_LIMIT = 12;

const LIVE_STATUSES = new Set(["active", "trial", "past_due", "restricted"]);
const SEED_HOST_LABEL = /^(qa|e2e|seed|test|demo|tmp|staging)(-|\d|$)/i;
const TEST_FLAGS = ["is_test", "is_demo", "is_seed", "isTest", "isDemo", "isSeed", "test", "demo"] as const;

export function isSeedHostname(hostname: string): boolean {
  const label = hostname.trim().toLowerCase().split(".")[0] ?? "";
  return SEED_HOST_LABEL.test(label);
}

const SITE_DOMAIN_RANK: Record<string, number> = { custom: 0, subdomain: 1 };

export function isPublicHubAgency(c: HubAgencyCandidate): boolean {
  if (SITE_DOMAIN_RANK[c.domainKind ?? ""] === undefined) return false; // app, marketing, hub, ...
  if (c.agencyKind !== "agency") return false; // hub / platform tenants
  if (c.hasPublishedHomepage !== true) return false;
  if (c.hasRealOwner !== true) return false; // no owner, or only test-account owners
  if (!c.name?.trim()) return false; // a bare address is never a card
  if (c.status != null && !LIVE_STATUSES.has(c.status)) return false;
  if (c.discoverExposureEnabled === false) return false;
  if (TEST_FLAGS.some((k) => c.settings?.[k] === true)) return false;
  if (isSeedHostname(c.hostname)) return false;
  return true;
}

export function filterPublicHubAgencies(candidates: readonly HubAgencyCandidate[]): HubAgencyItem[] {
  // One card per tenant: prefer a custom domain over a subdomain, then the first seen (stable).
  const best = new Map<string, HubAgencyCandidate>();
  const order: string[] = [];
  for (const c of candidates.filter(isPublicHubAgency)) {
    const key = c.tenantId ?? `host:${c.hostname}`;
    const cur = best.get(key);
    if (!cur) {
      best.set(key, c);
      order.push(key);
    } else if (SITE_DOMAIN_RANK[c.domainKind!]! < SITE_DOMAIN_RANK[cur.domainKind!]!) {
      best.set(key, c);
    }
  }
  return order.map((k) => best.get(k)!).map((c) => ({ hostname: c.hostname, name: c.name!.trim() }));
}

/** Search matches the NAME only: the address is not shown, so it must not be a hidden match. */
export function visibleHubAgencies(
  agencies: readonly HubAgencyItem[],
  query: string,
  expanded: boolean,
  limit: number = HUB_AGENCY_PREVIEW_LIMIT,
): { shown: HubAgencyItem[]; total: number; hiddenCount: number } {
  const needle = query.trim().toLowerCase();
  const matches = needle ? agencies.filter((a) => (a.name ?? "").toLowerCase().includes(needle)) : [...agencies];
  // Searching always shows every match; the cap only trims the browse state.
  const shown = expanded || needle ? matches : matches.slice(0, limit);
  return { shown, total: matches.length, hiddenCount: matches.length - shown.length };
}

const RESERVED_TEST_TLDS = new Set(["test", "example", "invalid", "localhost"]);

/** RFC 2606 / 6761 reserved TLDs: an address there can never belong to a real person. */
export function isReservedTestEmail(email: string | null | undefined): boolean {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return RESERVED_TEST_TLDS.has(domain.split(".").pop() ?? "");
}

/**
 * Which tenants have a real owner. `ownersByTenant` holds active 'owner' memberships; an owner is a
 * test account when their email is on a reserved TLD or any account flag (profiles.is_test_account,
 * talent_profiles.is_test_account / is_demo) is set. A tenant with no owner is not listed.
 */
export function tenantsWithRealOwner(input: {
  ownersByTenant: ReadonlyMap<string, readonly string[]>;
  emailByUser: ReadonlyMap<string, string>;
  flaggedUserIds: ReadonlySet<string>;
}): Set<string> {
  const out = new Set<string>();
  for (const [tenantId, owners] of input.ownersByTenant) {
    const real = owners.some((u) => !input.flaggedUserIds.has(u) && !isReservedTestEmail(input.emailByUser.get(u)));
    if (real) out.add(tenantId);
  }
  return out;
}
