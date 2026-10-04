/**
 * Host↔tenant gate for `/c/t/[token]` (Story 7 hard isolation).
 *
 * `verifyThreadToken` stays pure/DB-free. This is the HTTP-boundary check:
 * an agency (or hub) host must own the token's tenant. Marketing / app hosts
 * stay open so talent-site conversations can land on `tulala.digital`
 * (HUB_THREAD_ORIGIN) per Story 1 / thread-link.ts.
 *
 * Mirrors the share JWT cross-check in `app/share/[token]/page.tsx`.
 */
import { getPublicHostContext, type PublicHostContext } from "@/lib/saas/scope";

/** Pure predicate — unit-tested without request headers. */
export function threadTokenAllowedOnHost(
  tokenTenantId: string,
  ctx: Pick<PublicHostContext, "kind" | "tenantId">,
): boolean {
  if (!tokenTenantId) return false;
  if (ctx.kind === "agency" || ctx.kind === "hub") {
    return ctx.tenantId === tokenTenantId;
  }
  // marketing | app | talent_site | unknown — no exclusive agency tenant on
  // this host surface (talent vanity 404s `/c` in gate.ts; marketing is the
  // intentional platform landing for talent-site mint links).
  return true;
}

/** Server-only: read middleware host headers and apply the gate. */
export async function threadTokenMatchesRequestHost(tokenTenantId: string): Promise<boolean> {
  const ctx = await getPublicHostContext();
  return threadTokenAllowedOnHost(tokenTenantId, ctx);
}
