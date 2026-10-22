/**
 * Shared slug -> tenant id resolver for the review server actions (TUL-1688).
 *
 * Plain module (NOT "use server"): the action files may only export async
 * functions, and this keeps the resolver unit-testable.
 *
 * Why not `resolve_public_tenant_by_slug`: that RPC filters `kind = 'agency'`,
 * so the hub workspace (agencies.kind = 'hub') resolved to nothing and a hub
 * client's completed booking showed no review section. The client portal
 * resolves via getTenantPortalScopeBySlug (no kind filter) and proves the
 * caller is related to the tenant (host, staff membership, talent roster or
 * client relationship). Using the same resolver here keeps hub and agency
 * workspaces working AND requires a caller relationship. Callers keep their
 * own per-role checks (requireClient / requireTalent / booking ownership).
 */

export type TenantScopeLike = { tenantId: string } | null;
export type TenantScopeResolver = (slug: string) => Promise<TenantScopeLike>;

export async function resolveReviewTenantId(
  tenantSlug: string,
  resolveScope?: TenantScopeResolver,
): Promise<string | null> {
  const slug = (tenantSlug ?? "").trim();
  if (!slug) return null;
  const resolver =
    resolveScope ?? (await import("@/lib/saas/scope")).getTenantPortalScopeBySlug;
  const scope = await resolver(slug);
  return scope?.tenantId ?? null;
}
