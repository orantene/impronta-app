import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { loadPublicHubEntries } from "@/lib/service-hub/public-hub.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { PublicHubEntries } from "./PublicHubEntries";

/**
 * Server section for a workspace site: the host's own hub entries, request-only. The tenant
 * comes from the host (never a parameter), and no entries means no section.
 */
export async function PublicHubSection() {
  const scope = await getPublicTenantScope();
  const admin = createServiceRoleClient();
  if (!scope || !admin) return null;
  const entries = await loadPublicHubEntries(admin, scope.tenantId);
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  return <PublicHubEntries entries={entries} locale={locale} />;
}
