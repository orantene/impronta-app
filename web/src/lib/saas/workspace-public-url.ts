import { TULALA_APEX_HOST } from "@/lib/brand/tulala";
import { WORKSPACE_PATH_SEGMENT } from "@/lib/saas/surface-allow-list";

export type WorkspaceUrlPlan =
  | "free"
  | "website"
  | "studio"
  | "agency"
  | "network"
  | "legacy";

export type WorkspaceDomainState = {
  primaryHost: string | null;
  primaryHostKind: "subdomain" | "custom" | null;
  subdomainHost: string | null;
};

export type WorkspacePublicAddress = {
  pathHost: string;
  pathUrl: string;
  brandedSubdomainEligible: boolean;
  customDomainEligible: boolean;
  reservedBrandedSubdomainHost: string | null;
  actualBrandedSubdomainHost: string | null;
  primaryKind: "path" | "subdomain" | "custom";
  primaryHost: string;
  primaryUrl: string;
};

/**
 * Canonical public address for a path-based (free-tier) workspace:
 * `tulala.digital/w/<slug>`.
 *
 * The `/w` parent keeps every workspace out of the apex root namespace, so a
 * tenant slug can never shadow a marketing route. Legacy flat `/<slug>` URLs
 * still resolve — middleware 301s them here.
 */
export function workspacePathHost(slug: string): string {
  return `${TULALA_APEX_HOST}/${WORKSPACE_PATH_SEGMENT}/${slug}`;
}

export function workspacePathUrl(slug: string): string {
  return `https://${workspacePathHost(slug)}`;
}

export function brandedSubdomainEligible(plan: WorkspaceUrlPlan): boolean {
  return plan !== "free";
}

/**
 * Custom-domain eligibility is a SET, not a rank threshold. `website` ($12,
 * ranked below Studio) ships a custom domain because "your own domain" is the
 * entire product for a local business, while Studio (ranked above it) does
 * not. Any rank-comparison refactor here would silently break that.
 */
export function customDomainEligible(plan: WorkspaceUrlPlan): boolean {
  return (
    plan === "website" ||
    plan === "agency" ||
    plan === "network" ||
    plan === "legacy"
  );
}

/**
 * Whitelabel branding is a capability of the top workspace tiers. When on, the
 * agency's brand (logo + name) replaces Tulala on the OPERATIONAL surfaces its
 * talents and clients see — the talent/client dashboards, the auth chrome, agency
 * emails — and the "Powered by Tulala" footer mark is hidden. Public storefront
 * theming is unaffected (it is already tenant-branded regardless of tier).
 *
 * Auto-by-tier: eligibility is derived purely from the plan tier, no separate
 * entitlement toggle. Mirrors {@link customDomainEligible} — Agency and Network
 * (and grandfathered legacy) qualify; Free and Studio do not.
 */
export function whitelabelBrandingEligible(plan: WorkspaceUrlPlan): boolean {
  return plan === "agency" || plan === "network" || plan === "legacy";
}

/**
 * String-tolerant variant of {@link whitelabelBrandingEligible} for raw
 * `agencies.plan_tier` values read from the DB (which are plain strings, and may
 * be null for a missing/independent tenant). Anything that is not a recognized
 * whitelabel tier — including null, "free", "studio", or an unknown value —
 * returns false, so the safe default is always Tulala branding.
 */
export function planTierHasWhitelabel(planTier: string | null | undefined): boolean {
  return planTier === "agency" || planTier === "network" || planTier === "legacy";
}

export function customDomainLockedCopy(plan: WorkspaceUrlPlan): string {
  if (plan === "free") {
    return "Branded subdomains unlock on Website and Studio. Custom domains unlock on Website, Agency, and Network.";
  }
  return "Studio includes the branded Tulala subdomain. Custom domains unlock on Website, Agency, and Network.";
}

export function workspacePlanPublicModelCopy(plan: WorkspaceUrlPlan): string {
  if (plan === "free") {
    return "Free · tulala.digital/w/<slug> + up to 5 public profiles";
  }
  if (plan === "website") {
    return "Website · branded subdomain + custom domain, no talent roster";
  }
  if (plan === "studio") {
    return "Studio · branded subdomain (optional)";
  }
  if (plan === "network") {
    return "Network · shared templates and multi-workspace controls";
  }
  if (plan === "agency" || plan === "legacy") {
    return "Agency · branded subdomain + custom domain";
  }
  return plan;
}

export function reservedBrandedSubdomainHost(slug: string): string {
  return `${slug}.tulala.digital`;
}

function hostToUrl(host: string): string {
  return `https://${host}`;
}

export function resolveWorkspacePublicAddress(input: {
  slug: string;
  plan: WorkspaceUrlPlan;
  domainState: WorkspaceDomainState;
}): WorkspacePublicAddress {
  const pathHost = workspacePathHost(input.slug);
  const pathUrl = workspacePathUrl(input.slug);
  const subdomainAllowed = brandedSubdomainEligible(input.plan);
  const customAllowed = customDomainEligible(input.plan);
  const actualBrandedHost = subdomainAllowed ? input.domainState.subdomainHost : null;
  const reservedBrandedHost = subdomainAllowed
    ? reservedBrandedSubdomainHost(input.slug)
    : null;

  if (input.domainState.primaryHost && input.domainState.primaryHostKind === "custom") {
    return {
      pathHost,
      pathUrl,
      brandedSubdomainEligible: subdomainAllowed,
      customDomainEligible: customAllowed,
      reservedBrandedSubdomainHost: reservedBrandedHost,
      actualBrandedSubdomainHost: actualBrandedHost,
      primaryKind: "custom",
      primaryHost: input.domainState.primaryHost,
      primaryUrl: hostToUrl(input.domainState.primaryHost),
    };
  }

  if (actualBrandedHost) {
    return {
      pathHost,
      pathUrl,
      brandedSubdomainEligible: subdomainAllowed,
      customDomainEligible: customAllowed,
      reservedBrandedSubdomainHost: reservedBrandedHost,
      actualBrandedSubdomainHost: actualBrandedHost,
      primaryKind: "subdomain",
      primaryHost: actualBrandedHost,
      primaryUrl: hostToUrl(actualBrandedHost),
    };
  }

  return {
    pathHost,
    pathUrl,
    brandedSubdomainEligible: subdomainAllowed,
    customDomainEligible: customAllowed,
    reservedBrandedSubdomainHost: reservedBrandedHost,
    actualBrandedSubdomainHost: actualBrandedHost,
    primaryKind: "path",
    primaryHost: pathHost,
    primaryUrl: pathUrl,
  };
}
