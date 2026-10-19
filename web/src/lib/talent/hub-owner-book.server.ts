import "server-only";

import { getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveWorkspaceSitePublicUrl } from "@/lib/talent-site/workspace-site-editor-url";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { hubCardBookTarget, isHubProfileHost, ownerBookHref } from "./hub-profile-offerings";

/**
 * TUL-1272 money guard. On a hub/platform host, the profile's in-place booking
 * chrome runs under the HUB tenant, so a card for a row another workspace sells
 * must not open it. This returns, per such row, the owning workspace's own
 * booking page (that workspace's tenant, policies, currency and payout), or
 * null when no address resolves (the card then shows no Book action at all).
 *
 * undefined = nothing to override (non-hub host, or every row is the hub's own):
 * the storefront renders exactly as before.
 */
export async function loadHubOwnerBookHrefs(
  offerings: readonly Pick<TalentOffering, "id" | "tenantId">[],
): Promise<Record<string, string | null> | undefined> {
  const tenantIds = [...new Set(offerings.map((o) => o.tenantId).filter((t): t is string => !!t))];
  if (tenantIds.length === 0) return undefined;
  const host = await getPublicHostContext();
  if (!isHubProfileHost(host.kind)) return undefined;
  const admin = createServiceRoleClient();

  const tenants = new Map<string, { kind: string | null; siteUrl: string | null }>();
  await Promise.all(
    tenantIds.map(async (tenantId) => {
      if (!admin) {
        tenants.set(tenantId, { kind: null, siteUrl: null });
        return;
      }
      const { data, error } = await admin.from("agencies").select("kind, slug").eq("id", tenantId).maybeSingle();
      if (error) logServerError("hubOwnerBook.agency", error);
      const row = (error ? null : data) as { kind?: string | null; slug?: string | null } | null;
      const kind = row?.kind ?? null;
      const slug = row?.slug?.trim() || "";
      // The hub's own rows book in place; no address needed.
      const siteUrl =
        kind && kind !== "hub" && slug ? await resolveWorkspaceSitePublicUrl(admin, { tenantId, slug }) : null;
      tenants.set(tenantId, { kind, siteUrl });
    }),
  );

  const out: Record<string, string | null> = {};
  for (const o of offerings) {
    const tenant = o.tenantId ? tenants.get(o.tenantId) : undefined;
    const target = hubCardBookTarget({
      hostKind: host.kind,
      offeringTenantId: o.tenantId,
      offeringTenantKind: tenant?.kind ?? null,
    });
    if (target === "owner_link") out[o.id] = ownerBookHref(tenant?.siteUrl, o.id);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
