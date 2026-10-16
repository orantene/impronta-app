import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveTalentSiteContext,
  resolveTalentSubdomainContext,
  type TalentSiteEdgeClient,
} from "@/lib/saas/host-context";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import {
  classifyReturnHost,
  isSsoHandoffHostKind,
  type ReturnHostKind,
} from "@/lib/auth/return-host-kind";

/**
 * Classify `host` against the live registries: active agency_domains rows,
 * live talent custom domains (`talent_site_domain_lookup`) and, when the
 * subdomain switch is on, live talent subdomains
 * (`talent_site_subdomain_lookup`). Fails closed on any error.
 */
export async function classifyRegisteredReturnHost(
  host: string,
): Promise<ReturnHostKind | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const edge = admin as unknown as TalentSiteEdgeClient;
  return classifyReturnHost(host, {
    agencyDomainKind: async (h) => {
      const { data, error } = await admin
        .from("agency_domains")
        .select("hostname, kind")
        .eq("hostname", h)
        .in("status", ["active", "ssl_provisioned", "verified"])
        .limit(1);
      if (error) {
        logServerError("auth.classifyRegisteredReturnHost", error);
        throw error;
      }
      const row = data?.[0] as { kind?: string | null } | undefined;
      return row ? (row.kind ?? "subdomain") : null;
    },
    isLiveTalentCustomDomain: async (h) =>
      (await resolveTalentSiteContext(edge, h)) !== null,
    isLiveTalentSubdomain: async (h) =>
      (await resolveTalentSubdomainContext(edge, h)) !== null,
    talentSubdomainsEnabled: isTalentSiteSubdomainsEnabled(),
  });
}

/** Is `host` a registered Tulala host a post-auth `next` may return to? */
export async function isRegisteredReturnHost(host: string): Promise<boolean> {
  return (await classifyRegisteredReturnHost(host)) !== null;
}

/** Does a return to `host` need the one-time SSO hand-off (custom domain)? */
export async function needsSsoHandoffHost(host: string): Promise<boolean> {
  return isSsoHandoffHostKind(await classifyRegisteredReturnHost(host));
}
