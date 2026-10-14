import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveTalentSiteContext,
  type TalentSiteEdgeClient,
} from "@/lib/saas/host-context";

/**
 * Is `host` a registered Tulala host a post-auth `next` may return to?
 * True for an active agency_domains row (any kind) or a live talent custom
 * domain (`talent_site_domain_lookup`). Fails closed on any error.
 */
export async function isRegisteredReturnHost(host: string): Promise<boolean> {
  const h = (host.split(":")[0] ?? "").trim().toLowerCase();
  if (!h) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("agency_domains")
    .select("hostname")
    .eq("hostname", h)
    .in("status", ["active", "ssl_provisioned", "verified"])
    .limit(1);
  if (error) {
    logServerError("auth.isRegisteredReturnHost", error);
    return false;
  }
  if (data && data.length > 0) return true;
  const talent = await resolveTalentSiteContext(
    admin as unknown as TalentSiteEdgeClient,
    h,
  );
  return talent !== null;
}
