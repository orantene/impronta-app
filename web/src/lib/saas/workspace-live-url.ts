/**
 * The one honest answer to "what URL is this workspace actually reachable at?"
 *
 * WHY THIS EXISTS: the admin shell used to synthesize `<slug>.tulala.digital`
 * unconditionally and label it the workspace's LIVE URL, complete with a green
 * dot and a Copy button. For a self-serve Free workspace that host is never
 * registered — self-serve signup writes no `agency_domains` row, and branded
 * subdomains are a paid feature (`brandedSubdomainEligible(plan) => plan !==
 * "free"`) — so the advertised address returns the middleware's 404 "Host not
 * registered". The canonical Free address is `tulala.digital/w/<slug>`.
 *
 * Two rules, both enforced here:
 *   1. A branded host counts ONLY if a real `agency_domains` row exists for it
 *      AND that row has reached a live status. A `pending` DNS row is not an
 *      address you can hand a client.
 *   2. Plan eligibility still gates: even a stray subdomain row on a Free
 *      workspace does not make a branded host correct.
 *
 * Deliberately free of `server-only` imports and of the server-side
 * `WorkspaceDomainSummary` type (structural input instead) so the admin shell's
 * client components can call it with the bridge payload they already receive.
 */
import {
  resolveWorkspacePublicAddress,
  type WorkspaceDomainState,
  type WorkspacePublicAddress,
  type WorkspaceUrlPlan,
} from "@/lib/saas/workspace-public-url";

/**
 * `agency_domains.status` values that mean "this hostname resolves today".
 * Mirrors `READY_STATUSES` in `lib/site-admin/server/tenant-hosts.ts`.
 */
export const LIVE_DOMAIN_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "ssl_provisioned",
  "verified",
]);

export function isLiveDomainStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && LIVE_DOMAIN_STATUSES.has(status);
}

const WORKSPACE_URL_PLANS: ReadonlySet<string> = new Set([
  "free",
  "studio",
  "agency",
  "network",
  "legacy",
]);

/**
 * Raw `agencies.plan_tier` → the plan union. Anything unrecognized (including
 * null) degrades to "free", the least-privileged answer — an unknown plan must
 * never be assumed to own a branded host.
 */
export function normalizeWorkspaceUrlPlan(
  planTier: string | null | undefined,
): WorkspaceUrlPlan {
  const raw = typeof planTier === "string" ? planTier.trim().toLowerCase() : "";
  return WORKSPACE_URL_PLANS.has(raw) ? (raw as WorkspaceUrlPlan) : "free";
}

export type WorkspaceDomainRow = {
  hostname: string;
  isPrimary?: boolean;
  status?: string | null;
};

export type WorkspaceDomainRegistry = {
  subdomains?: ReadonlyArray<WorkspaceDomainRow> | null;
  customDomains?: ReadonlyArray<WorkspaceDomainRow> | null;
};

function pickLiveHost(
  rows: ReadonlyArray<WorkspaceDomainRow> | null | undefined,
): string | null {
  const live = (rows ?? []).filter(
    (row) => row.hostname?.trim() && isLiveDomainStatus(row.status),
  );
  const chosen = live.find((row) => row.isPrimary === true) ?? live[0] ?? null;
  return chosen ? chosen.hostname.trim() : null;
}

/**
 * Build the `WorkspaceDomainState` that `resolveWorkspacePublicAddress`
 * expects, keeping ONLY hostnames backed by a live `agency_domains` row.
 */
export function resolveLiveDomainState(
  registry: WorkspaceDomainRegistry | null | undefined,
): WorkspaceDomainState {
  const customHost = pickLiveHost(registry?.customDomains);
  const subdomainHost = pickLiveHost(registry?.subdomains);
  if (customHost) {
    return {
      primaryHost: customHost,
      primaryHostKind: "custom",
      subdomainHost,
    };
  }
  if (subdomainHost) {
    return {
      primaryHost: subdomainHost,
      primaryHostKind: "subdomain",
      subdomainHost,
    };
  }
  return { primaryHost: null, primaryHostKind: null, subdomainHost: null };
}

export function resolveWorkspaceLiveAddress(input: {
  slug: string;
  planTier: string | null | undefined;
  domains?: WorkspaceDomainRegistry | null;
}): WorkspacePublicAddress {
  return resolveWorkspacePublicAddress({
    slug: input.slug,
    plan: normalizeWorkspaceUrlPlan(input.planTier),
    domainState: resolveLiveDomainState(input.domains),
  });
}

/** Host with no scheme, e.g. `tulala.digital/w/acme` or `acme.tulala.digital`. */
export function workspaceLiveHost(input: {
  slug: string;
  planTier: string | null | undefined;
  domains?: WorkspaceDomainRegistry | null;
}): string {
  return resolveWorkspaceLiveAddress(input).primaryHost;
}

/** Absolute `https://…` URL for the workspace's real public address. */
export function workspaceLiveUrl(input: {
  slug: string;
  planTier: string | null | undefined;
  domains?: WorkspaceDomainRegistry | null;
}): string {
  return resolveWorkspaceLiveAddress(input).primaryUrl;
}

/**
 * The workspace's live CUSTOM domain, or "" when it has none. Never a
 * fabricated `<slug>.com` placeholder.
 */
export function workspaceLiveCustomDomain(
  domains: WorkspaceDomainRegistry | null | undefined,
): string {
  const state = resolveLiveDomainState(domains);
  return state.primaryHostKind === "custom" ? state.primaryHost ?? "" : "";
}
