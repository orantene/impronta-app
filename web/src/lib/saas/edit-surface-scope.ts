/**
 * Editor tenant scope — resolved from the SURFACE BEING EDITED.
 *
 * WHY THIS EXISTS (P1, 2026-08-07)
 * --------------------------------
 * Every builder / edit-chrome server action used to answer "which tenant am
 * I editing?" with {@link requireTenantScope}, whose precedence is:
 *
 *     x-impronta-tenant-id header  →  impronta.active_tenant_id cookie
 *                                  →  the actor's FIRST active membership
 *
 * Only the first of those three has anything to do with the storefront under
 * the operator's cursor. It happens to be set today because `proxy.ts` writes
 * it for `kind: "agency" | "hub"` requests, so for a single-workspace operator
 * the three answers coincide and the defect is invisible.
 *
 * For a multi-workspace operator they diverge the moment the header is absent
 * for any reason (a surface that middleware classifies as `app`/`marketing`, a
 * mid-deploy state where the header is not yet written, a future route that
 * reaches an editor action off the storefront path). The action then silently
 * falls through to the *cookie or default* workspace: best case the operator
 * gets "Select an agency workspace", worst case the action reads or writes a
 * DIFFERENT tenant of theirs than the one on screen. `qa-admin@impronta.test`
 * has six active memberships, so its default (`impronta`) is not the QA tenant
 * it is usually editing.
 *
 * The fix is to make the surface the PRIMARY input rather than an incidental
 * one, and to fail closed instead of falling back whenever a storefront
 * surface is present.
 *
 * STRUCTURAL PROPERTIES THIS PRESERVES
 * ------------------------------------
 *  1. **No caller-supplied tenant id.** Nothing here takes an argument. The
 *     tenant is derived server-side from request headers written by
 *     `proxy.ts` from a verified `agency_domains` lookup, exactly like
 *     {@link getPublicHostContext}. An action cannot be talked into another
 *     tenant by its payload.
 *  2. **Membership is still proven.** The surface tells us WHICH tenant; the
 *     actor's `agency_memberships` rows decide whether they may act on it.
 *     A non-member on a storefront gets `null`, never a downgrade to some
 *     other workspace they do happen to belong to.
 *  3. **Capability gates are untouched.** This changes which tenant id is
 *     resolved, not whether `userHasCapability(...)` runs afterwards
 *     (#995 / #997).
 *
 * FALLBACK
 * --------
 * When the request carries NO tenant surface (host kind `app`, `marketing`,
 * `talent_site`, or `unknown` — i.e. the workspace admin app, not a
 * storefront), there is nothing to derive from, and we defer to
 * {@link getTenantScope} exactly as before. That keeps admin-host callers
 * byte-for-byte identical in behaviour and makes this a strict refinement:
 * on a storefront it gets stricter, off a storefront it is a no-op.
 */

import { cache } from "react";

import { improntaLog } from "@/lib/server/structured-log";
import { getCurrentUserTenants } from "@/lib/saas/tenant";
import {
  getPublicHostContext,
  getTenantScope,
  type TenantScope,
} from "@/lib/saas/scope";

/**
 * The tenant id of the storefront surface this request is rendering, or
 * `null` when the request is not on a tenant surface at all.
 *
 * Deliberately mirrors the `kind` narrowing `EditChromeMount` uses — the
 * editor only ever mounts on `agency` / `hub` hosts, so those are the only
 * two kinds that can be "the surface being edited".
 */
export async function getEditSurfaceTenantId(): Promise<string | null> {
  const host = await getPublicHostContext();
  if (host.kind === "agency" || host.kind === "hub") {
    return host.tenantId;
  }
  return null;
}

/**
 * Tenant scope for an editor server action, resolved from the surface first.
 *
 * Returns `null` when:
 *   - the request is on a storefront surface the actor has no membership in
 *     (fail closed — we do NOT fall back to another of their workspaces), or
 *   - there is no surface AND {@link getTenantScope} cannot resolve one.
 *
 * Request-cached, like the helpers it composes.
 */
export const getEditSurfaceTenantScope = cache(
  async (): Promise<TenantScope | null> => {
    const surfaceTenantId = await getEditSurfaceTenantId();
    if (!surfaceTenantId) {
      // Not a storefront request (workspace admin app, marketing, tests).
      // Nothing to derive from — previous behaviour, unchanged.
      return getTenantScope();
    }

    const memberships = await getCurrentUserTenants();
    const match = memberships.find((m) => m.tenant_id === surfaceTenantId);
    if (match) {
      return { tenantId: match.tenant_id, membership: match };
    }

    // The actor is on tenant X's storefront but is not a member of X. The old
    // code would have handed back whichever workspace their cookie / default
    // pointed at and let the action operate on THAT tenant's rows. Fail
    // closed instead, and leave a grep-able trail.
    void improntaLog("security.edit_surface_scope_non_member", {
      surface_tenant_id: surfaceTenantId,
      membership_count: memberships.length,
    });
    return null;
  },
);

/**
 * Assert-flavoured variant, drop-in for `requireTenantScope()` at the top of
 * editor server actions. Throws when no scope resolves; every call site in
 * `edit-mode/**` and the builder-core adapters wraps it in
 * `.catch(() => null)` and returns a typed error result.
 */
export async function requireEditSurfaceTenantScope(): Promise<TenantScope> {
  const scope = await getEditSurfaceTenantScope();
  if (!scope) {
    throw new Error("no editor tenant scope resolved for this request");
  }
  return scope;
}
