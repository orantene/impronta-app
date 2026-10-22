/**
 * TUL-1884: which agencies the hub home lists, and how many show before "see all".
 * Pure so a test pins it; the server loader and the client list share it.
 *
 * Public means: a live workspace (not draft/archived/suspended/cancelled), one that has not opted out
 * of Discover, with a real name, and not a seed/test/demo workspace. There is no `is_test` column on
 * `agencies`, so test data is recognised by its explicit settings flags and by the seed host pattern
 * (`qa-1`, `e2e-*`, `seed-*`, `test-*`, `demo-*`).
 */
export type HubAgencyItem = { hostname: string; name: string | null };

export type HubAgencyCandidate = {
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

export function isPublicHubAgency(c: HubAgencyCandidate): boolean {
  if (!c.name?.trim()) return false; // a bare address is never a card
  if (c.status != null && !LIVE_STATUSES.has(c.status)) return false;
  if (c.discoverExposureEnabled === false) return false;
  if (TEST_FLAGS.some((k) => c.settings?.[k] === true)) return false;
  if (isSeedHostname(c.hostname)) return false;
  return true;
}

export function filterPublicHubAgencies(candidates: readonly HubAgencyCandidate[]): HubAgencyItem[] {
  return candidates
    .filter(isPublicHubAgency)
    .map((c) => ({ hostname: c.hostname, name: c.name!.trim() }));
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
