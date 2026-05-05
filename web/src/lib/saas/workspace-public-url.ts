import { TULALA_APEX_HOST } from "@/lib/brand/tulala";

export type WorkspaceUrlPlan = "free" | "studio" | "agency" | "network" | "legacy";

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

export function workspacePathHost(slug: string): string {
  return `${TULALA_APEX_HOST}/${slug}`;
}

export function workspacePathUrl(slug: string): string {
  return `https://${workspacePathHost(slug)}`;
}

export function brandedSubdomainEligible(plan: WorkspaceUrlPlan): boolean {
  return plan !== "free";
}

export function customDomainEligible(plan: WorkspaceUrlPlan): boolean {
  return plan === "agency" || plan === "network" || plan === "legacy";
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
