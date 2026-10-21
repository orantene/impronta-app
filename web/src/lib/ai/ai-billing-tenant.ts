/**
 * TUL-1624 · Which workspace an anonymous / public AI call is billed to. Public AI (search, inquiry drafting,
 * transcription, the front-door assistant) used to gate and record against the single platform tenant, so one busy site
 * could spend the platform's whole ceiling and switch AI off everywhere. Now a request that arrives on a workspace's
 * host is attributed to THAT workspace; only true platform traffic (the tulala.digital front door, onboarding with no
 * workspace yet) stays on the platform tenant.
 */
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";

/** Pure: the tenant for a resolved host context. */
export function aiBillingTenantFromHost(ctx: { kind: string; tenantId?: string | null } | null | undefined): string {
  return ctx && ctx.kind === "agency" && ctx.tenantId ? ctx.tenantId : DEFAULT_AI_TENANT_ID;
}

/** The tenant for the current request. Any failure to resolve the host falls back to the platform tenant. */
export async function resolveAiBillingTenantId(): Promise<string> {
  try {
    const { getPublicHostContext } = await import("@/lib/saas/scope");
    return aiBillingTenantFromHost((await getPublicHostContext()) as { kind: string; tenantId?: string | null });
  } catch {
    return DEFAULT_AI_TENANT_ID;
  }
}
