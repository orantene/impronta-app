/**
 * library-tenant-decision.ts — which tenant a media-library API call may act on.
 *
 * The staff library route used to accept a request only when the client's
 * `tenantId` equalled `requireTenantScope()`, which resolves from the
 * `x-impronta-tenant-id` header, then the `impronta.active_tenant_id` cookie,
 * then the first membership. `/api/*` paths carry no workspace on the apex or
 * app host (the proxy strips the header there), so a builder opened on
 * `/w/<slug>?edit=1` fired a request whose scope came from a stale switcher
 * cookie (null, "Select an agency workspace first") or another membership
 * (403 "tenantId mismatch"). The builder UI collapsed every such failure into
 * "Could not load the media library", and Retry could never succeed because
 * the next request resolved the same wrong scope.
 *
 * The client's `tenantId` is an INDEX into the caller's own active memberships,
 * exactly like the workspace-switcher cookie it replaces: it grants nothing the
 * caller could not already select, and RLS still gates every read.
 */

import type { TenantMembership } from "@/lib/saas/tenant";

export type LibraryTenantReason =
  | "no-requested-tenant"
  | "no-scope"
  | "tenant-mismatch";

export type LibraryTenantDecision =
  | { ok: true; tenantId: string; via: "scope" | "membership" }
  | { ok: false; status: 400 | 403; error: string; reason: LibraryTenantReason };

export function decideLibraryTenant(input: {
  requestedTenantId: string | null;
  scopeTenantId: string | null;
  memberships: ReadonlyArray<Pick<TenantMembership, "tenant_id" | "status">>;
}): LibraryTenantDecision {
  const { requestedTenantId, scopeTenantId, memberships } = input;
  if (!requestedTenantId) {
    return {
      ok: false,
      status: 403,
      error: "tenantId mismatch",
      reason: "no-requested-tenant",
    };
  }
  if (scopeTenantId === requestedTenantId) {
    return { ok: true, tenantId: requestedTenantId, via: "scope" };
  }
  const member = memberships.some(
    (m) => m.tenant_id === requestedTenantId && m.status === "active",
  );
  if (member) {
    return { ok: true, tenantId: requestedTenantId, via: "membership" };
  }
  if (!scopeTenantId && memberships.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Select an agency workspace first.",
      reason: "no-scope",
    };
  }
  return {
    ok: false,
    status: 403,
    error: "tenantId mismatch",
    reason: "tenant-mismatch",
  };
}
