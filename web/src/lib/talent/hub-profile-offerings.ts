/**
 * TUL-1272 (consultant product call, 2026-10-19): the hub profile `/t/<code>`
 * shows the talent's OWN offerings (`owner_kind = 'talent'`) whatever tenant
 * the row carries, guest-visible only (published + approved + public, plus
 * on_request shown without a price, D-10a). A business's own catalog
 * (`owner_kind = 'workspace'`) and `agency_only` rows never reach a hub page.
 * Agency hosts keep their tenant scoping unchanged.
 *
 * MONEY GUARD: a hub card for a row another workspace sells must never open
 * checkout in the hub tenant. It links to the owning workspace's own booking
 * page, where that workspace's tenant, policies, currency and payout apply.
 *
 * Pure (no server imports) so the rules are unit-tested.
 */

import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";

export type PublicOfferingsScope = {
  /** `.eq("tenant_id", ...)` value; null reads every tenant. */
  filterTenantId: string | null;
  channel: "direct" | "agency";
  /** True on a hub tenant: talent-owned rows of any tenant. */
  hubCatalog: boolean;
};

/**
 * Which rows a public offerings read covers. A HUB tenant owns no catalog of
 * its own, so passing it means "this talent's own services": no tenant filter,
 * the talent's direct channel. Any other tenant (or an unknown kind) keeps the
 * old agency isolation.
 */
export function publicOfferingsScope(input: {
  tenantId: string | null | undefined;
  tenantKind: string | null | undefined;
  channel?: "direct" | "agency";
}): PublicOfferingsScope {
  const tenantId = input.tenantId || null;
  if (tenantId && input.tenantKind === "hub") {
    return { filterTenantId: null, channel: input.channel ?? "direct", hubCatalog: true };
  }
  return {
    filterTenantId: tenantId,
    channel: input.channel ?? (tenantId ? "agency" : "direct"),
    hubCatalog: false,
  };
}

type ListableRow = {
  owner_kind?: unknown;
  status?: unknown;
  moderation_state?: unknown;
  visibility?: unknown;
};

/** A row a hub profile may list: talent-owned and guest-visible (on_request priceless). */
export function isHubProfileListableOffering(row: ListableRow | null | undefined): boolean {
  if (!row || row.owner_kind !== "talent") return false;
  if (isGuestSellableOffering(row)) return true;
  return isGuestSellableOffering({ ...row, visibility: row.visibility === "on_request" ? "public" : row.visibility });
}

/** Hosts that render the platform/hub `/t/<code>` profile. */
const HUB_PROFILE_HOSTS = new Set(["marketing", "app", "hub"]);

export function isHubProfileHost(hostKind: string): boolean {
  return HUB_PROFILE_HOSTS.has(hostKind);
}

export type HubCardBookTarget = "in_place" | "owner_link";

/**
 * Where a hub card's Book action goes. On a hub/platform host the in-place
 * booking chrome runs under the hub tenant, so only a row the hub tenant itself
 * sells books in place. Every other row (or an unknown tenant kind: fail closed)
 * links to its owner's booking page. Non-hub hosts are unchanged.
 */
export function hubCardBookTarget(input: {
  hostKind: string;
  offeringTenantId: string | null | undefined;
  offeringTenantKind: string | null | undefined;
}): HubCardBookTarget {
  if (!isHubProfileHost(input.hostKind)) return "in_place";
  if (!input.offeringTenantId) return "in_place";
  return input.offeringTenantKind === "hub" ? "in_place" : "owner_link";
}

/** The owning workspace's booking page for one service, or null when no safe address exists. */
export function ownerBookHref(siteUrl: string | null | undefined, offeringId: string): string | null {
  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]/i.test(base)) return null;
  return `${base}/book?service=${encodeURIComponent(offeringId)}`;
}
