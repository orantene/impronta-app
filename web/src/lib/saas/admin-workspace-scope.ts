/**
 * Admin workspace scope — resolved from the WORKSPACE SURFACE the request is
 * acting on, never from the operator's preferred-tenant cookie or default
 * membership.
 *
 * WHY THIS EXISTS (P0, 2026-08-07)
 * --------------------------------
 * Every workspace-admin server action used to answer "which tenant am I
 * administering?" with {@link getTenantScope}, whose precedence is:
 *
 *     x-impronta-tenant-id header  →  impronta.active_tenant_id cookie
 *                                  →  the actor's FIRST active membership
 *
 * None of those is the workspace named in the URL. On the shared app host the
 * header is absent (`kind: "app"` strips it), so a multi-workspace operator
 * standing on `/nova-crew/admin/settings` with a cookie preferring `impronta`
 * had every server action read AND write `impronta` — live-reproduced with
 * the Brand identity drawer, which loaded impronta's logo and saved the new
 * upload onto impronta's `agencies.settings` + `agency_branding` rows while
 * the operator believed they were editing Nova Crew. Silent cross-workspace
 * corruption for any user with 2+ memberships.
 *
 * This is the admin-surface sibling of PR #1031's `edit-surface-scope.ts`
 * (which fixed the same bug class for storefront EDIT surfaces): make the
 * surface the PRIMARY input, and fail closed instead of falling back whenever
 * a workspace surface is present.
 *
 * WHERE THE SURFACE COMES FROM (all server-derived, none caller-suppliable)
 * -------------------------------------------------------------------------
 *  1. The workspace slug in the request URL. `proxy.ts` stamps the
 *     browser-facing path into `x-impronta-original-pathname` on every
 *     request AFTER sanitising all inbound `x-impronta-*` headers, so the
 *     value is proxy-written, never client-forged. Server actions POST to the
 *     page URL they were invoked from, so `/nova-crew/admin/settings` names
 *     `nova-crew` for every action fired from that surface. Handles both the
 *     canonical `/{slug}/admin/*` shape and the path-addressed
 *     `/w/{slug}/admin/*` shape.
 *  2. On a branded tenant host (custom domain / subdomain) the admin URL is
 *     slug-less (`/admin/...`), but the HOST names the workspace: middleware
 *     resolved it against the verified `agency_domains` table and stamped
 *     `x-impronta-tenant-id` (host kind `agency`).
 *  3. For fetch()-style API routes (`/api/admin/*`, `/api/media/*`) the
 *     request path carries no slug and on the app host there is no tenant
 *     header either. The `referer` header names the admin page the fetch was
 *     fired from; a slug parsed out of it is only ever an INDEX into the
 *     caller's own memberships (membership + capability checks still gate),
 *     so it grants nothing the workspace-switcher cookie could not — but it
 *     matches what is actually on the operator's screen.
 *
 * In every branch the derived workspace is verified against the caller's own
 * `agency_memberships` rows. A caller on workspace X's admin surface who is
 * not a member of X gets `null` — we never downgrade to another workspace
 * they happen to belong to. Only when NO workspace surface can be derived at
 * all (talent/client surfaces, tests, non-request contexts) do we defer to
 * {@link getTenantScope}, keeping non-workspace callers byte-for-byte
 * identical: on an admin surface this is stricter, off one it is a no-op.
 */

import { cache } from "react";
import { headers } from "next/headers";

import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { improntaLog } from "@/lib/server/structured-log";
import {
  getCurrentUserTenants,
  type TenantMembership,
} from "@/lib/saas/tenant";
import {
  getPublicHostContext,
  getTenantScope,
  type TenantScope,
} from "@/lib/saas/scope";

/**
 * Extract the workspace slug from an admin-surface pathname, or `null` when
 * the path is not a slug-carrying admin surface.
 *
 *   "/nova-crew/admin/settings"   → "nova-crew"
 *   "/w/nova-crew/admin"          → "nova-crew"   (path-addressed tenant)
 *   "/admin/settings"             → null          (branded host — slug-less)
 *   "/api/admin/roster-import"    → null          ("api" is a route prefix)
 *   "/nova-crew/talent/inbox/1"   → null          (talent surface, not admin)
 *
 * Pure and exported so the security suite can pin it without standing up
 * `headers()`.
 */
export function extractAdminWorkspaceSlug(pathname: string): string | null {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;
  const match = /^\/(?:w\/)?([a-z0-9][a-z0-9-]{1,62})\/admin(?:\/|$)/.exec(
    pathname,
  );
  if (!match) return null;
  const slug = match[1];
  // `/api/admin/*` route prefixes and a hypothetical `/w/admin` are not
  // tenant slugs.
  if (slug === "api" || slug === "w") return null;
  return slug;
}

/**
 * The membership matching the derived workspace, or `null`. Deliberately
 * mirrors `pickEditSurfaceMembership`: it never scans for a "default" when
 * the surface workspace is missing from the list — that absent fallback IS
 * the fix.
 */
export function pickWorkspaceMembership(
  memberships: ReadonlyArray<TenantMembership>,
  match: { slug: string } | { tenantId: string },
): TenantMembership | null {
  if ("slug" in match) {
    return memberships.find((m) => m.slug === match.slug) ?? null;
  }
  return memberships.find((m) => m.tenant_id === match.tenantId) ?? null;
}

/**
 * Tenant scope for a workspace-admin server action / route handler, resolved
 * from the workspace surface first (see the file doc for the derivation
 * order). Returns `null` when the request IS on a workspace surface the
 * caller has no membership in (fail closed — no downgrade), and defers to
 * {@link getTenantScope} only when no workspace surface exists at all.
 *
 * Nullary BY DESIGN: an action cannot be talked into another tenant by its
 * payload. Request-cached, like the helpers it composes.
 */
export const getAdminWorkspaceScope = cache(
  async (): Promise<TenantScope | null> => {
    let pathSlug: string | null = null;
    let refererSlug: string | null = null;
    try {
      const h = await headers();
      pathSlug = extractAdminWorkspaceSlug(
        h.get(ORIGINAL_PATHNAME_HEADER) ?? "",
      );
      if (!pathSlug) {
        const referer = h.get("referer");
        if (referer) {
          try {
            refererSlug = extractAdminWorkspaceSlug(new URL(referer).pathname);
          } catch {
            // Malformed referer — ignore, weaker signals below still apply.
          }
        }
      }
    } catch {
      // headers() outside a request scope (build, tests) — no surface signal.
    }

    // 1. Workspace slug in the request URL (proxy-stamped, not forgeable).
    if (pathSlug) {
      return resolveMembershipOrFailClosed({ slug: pathSlug }, "path");
    }

    // 2. Branded tenant host — the host itself names the workspace, verified
    //    by middleware against `agency_domains`.
    const host = await getPublicHostContext();
    if (host.kind === "agency") {
      return resolveMembershipOrFailClosed({ tenantId: host.tenantId }, "host");
    }

    // 3. API routes on the shared app host — slug from the referring admin
    //    page. Only an index into the caller's own memberships; grants
    //    nothing beyond the switcher cookie it replaces.
    if (refererSlug) {
      return resolveMembershipOrFailClosed({ slug: refererSlug }, "referer");
    }

    // No workspace surface on this request — previous behaviour, unchanged.
    return getTenantScope();
  },
);

async function resolveMembershipOrFailClosed(
  match: { slug: string } | { tenantId: string },
  source: "path" | "host" | "referer",
): Promise<TenantScope | null> {
  const memberships = await getCurrentUserTenants();
  const membership = pickWorkspaceMembership(memberships, match);
  if (membership) {
    return { tenantId: membership.tenant_id, membership };
  }
  // The caller is on workspace X's admin surface but is not a member of X.
  // The old chain would have handed back whichever workspace their cookie /
  // default pointed at and let the action operate on THAT tenant's rows.
  // Fail closed instead, and leave a grep-able trail.
  void improntaLog("security.admin_workspace_scope_non_member", {
    source,
    attempted: "slug" in match ? match.slug : match.tenantId,
    membership_count: memberships.length,
  });
  return null;
}
