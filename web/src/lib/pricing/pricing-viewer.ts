import "server-only";
/**
 * pricing-viewer.ts: who is looking at /pricing, for signed-in CTAs (TUL-828).
 * /pricing already renders per request (searchParams + the auth-aware header),
 * so the href may differ per viewer without a caching hazard. Any failure
 * degrades to the signed-out `/start` links.
 */
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getAppUrl } from "@/lib/auth-flow";
import { resolveActorIdentity } from "@/lib/identity/hybrid-mode";
import type { PricingViewer } from "./pricing-cta-href";
import { derivePricingViewer } from "./pricing-viewer-derive";

export async function resolvePricingViewer(): Promise<PricingViewer> {
  try {
    const actor = await getCachedActorSession();
    if (!actor.user || !actor.supabase) return { kind: "anon" };
    const identity = await resolveActorIdentity(actor.supabase, actor.user.id);
    return derivePricingViewer({
      appUrl: getAppUrl(),
      isTalent: Boolean(identity?.talent),
      workspaces: (identity?.workspaces ?? []).map((w) => ({
        slug: w.tenantSlug,
        role: w.role,
      })),
    });
  } catch {
    return { kind: "anon" };
  }
}
