/**
 * TUL-77 (#32): the base path a workspace site's internal links hang from.
 *
 * `/w/<slug>` on the shared path host (tulala.digital/w/<slug>), nothing on a
 * branded subdomain or custom domain. Built from the same address resolver the
 * dashboard uses, so the composer and "Open my site" can never disagree.
 *
 * Pure: the caller reads `agency_domains` and hands the rows in.
 */
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { isLiveDomainStatus, normalizeWorkspaceUrlPlan } from "@/lib/saas/workspace-live-url";
import { resolveWorkspacePublicAddress } from "@/lib/saas/workspace-public-url";
import { WORKSPACE_PATH_SEGMENT } from "@/lib/saas/surface-allow-list";

export type SiteDomainRow = {
  hostname: string;
  kind: string;
  status: string | null;
  is_primary: boolean | null;
};

export function siteBasePath(input: {
  slug: string;
  planTier: string | null | undefined;
  domains: ReadonlyArray<SiteDomainRow>;
}): string {
  const live = input.domains.filter(
    (d) => (d.kind === "subdomain" || d.kind === "custom") && isLiveDomainStatus(d.status),
  );
  const customs = live.filter((d) => d.kind === "custom");
  const subs = live.filter((d) => d.kind === "subdomain");
  const primary =
    live.find((d) => d.is_primary) ?? customs[0] ?? subs[0] ?? null;
  const address = resolveWorkspacePublicAddress({
    slug: input.slug,
    plan: normalizeWorkspaceUrlPlan(input.planTier),
    domainState: {
      primaryHost: primary?.hostname ?? null,
      primaryHostKind: primary?.kind === "custom" || primary?.kind === "subdomain" ? primary.kind : null,
      subdomainHost: (subs.find((d) => d.is_primary) ?? subs[0])?.hostname ?? null,
    },
  });
  return address.primaryKind === "path" ? `/${WORKSPACE_PATH_SEGMENT}/${input.slug}` : "";
}

/** Prefix every page href with the site base path (idempotent). */
export function withSiteBasePath<K extends string>(
  hrefs: Record<K, string>,
  basePath: string,
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(hrefs) as K[]) out[key] = prefixPublicHref(hrefs[key], basePath);
  return out;
}
