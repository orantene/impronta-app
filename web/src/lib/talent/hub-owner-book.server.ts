import "server-only";

import { cache } from "react";

import { getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveWorkspaceSitePublicUrl } from "@/lib/talent-site/workspace-site-editor-url";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  filterInPlaceBookOfferings,
  hubCardBookTarget,
  isHubProfileHost,
  ownerBookHref,
} from "./hub-profile-offerings";

type TenantBookInfo = { kind: string | null; siteUrl: string | null };

/** One row tenant's kind + public site address, request-cached (storefront and page share it). */
const loadTenantBookInfo = cache(async (tenantId: string): Promise<TenantBookInfo> => {
  const admin = createServiceRoleClient();
  if (!admin) return { kind: null, siteUrl: null };
  const { data, error } = await admin.from("agencies").select("kind, slug").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("hubOwnerBook.agency", error);
    return { kind: null, siteUrl: null };
  }
  const row = data as { kind?: string | null; slug?: string | null } | null;
  const kind = row?.kind ?? null;
  const slug = row?.slug?.trim() || "";
  // The hub's own rows book in place; no address needed.
  const siteUrl = kind && kind !== "hub" && slug ? await resolveWorkspaceSitePublicUrl(admin, { tenantId, slug }) : null;
  return { kind, siteUrl };
});

async function loadTenantInfos(
  offerings: readonly Pick<TalentOffering, "tenantId">[],
): Promise<Map<string, TenantBookInfo>> {
  const ids = [...new Set(offerings.map((o) => o.tenantId).filter((t): t is string => !!t))];
  const infos = await Promise.all(ids.map((id) => loadTenantBookInfo(id)));
  return new Map(ids.map((id, i) => [id, infos[i]!]));
}

/**
 * TUL-1272 money guard (cards). On a hub/platform host the profile's in-place
 * booking chrome runs under the HUB tenant, so a card for a row another
 * workspace sells must not open it. Returns, per such row, the owning
 * workspace's own booking page (its tenant, policies, currency and payout), or
 * null when no address resolves (the card shows no Book action at all).
 *
 * undefined = nothing to override (non-hub host, or every row is the hub's own).
 */
export async function loadHubOwnerBookHrefs(
  offerings: readonly Pick<TalentOffering, "id" | "tenantId">[],
): Promise<Record<string, string | null> | undefined> {
  if (offerings.length === 0) return undefined;
  const host = await getPublicHostContext();
  if (!isHubProfileHost(host.kind)) return undefined;
  const tenants = await loadTenantInfos(offerings);

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

/**
 * TUL-1272 money guard (page rails). The offerings the hub Book button, `#book`,
 * `#book-<id8>` and the slot picker may open: on a hub host only the rows a hub
 * tenant sells; every offering on any other host (unchanged).
 */
export async function loadHubInPlaceOfferings(offerings: TalentOffering[]): Promise<TalentOffering[]> {
  const host = await getPublicHostContext();
  if (!isHubProfileHost(host.kind)) return offerings;
  const tenants = await loadTenantInfos(offerings);
  const tenantKinds = new Map([...tenants].map(([id, info]) => [id, info.kind]));
  return filterInPlaceBookOfferings(offerings, { hostKind: host.kind, tenantKinds });
}
