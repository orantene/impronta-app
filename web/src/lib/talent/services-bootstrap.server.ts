import "server-only";

import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext, readUserId } from "@/lib/impersonation/effective-read";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { TALENT_LOADER_BUDGET_MS } from "@/lib/talent/loader-budget";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { withTimeout } from "@/lib/tulala/with-timeout";

/**
 * TUL-824: what the Servicios page needs for its FIRST paint, loaded by the
 * `/talent/services` route on the server. The client used to fire this as a
 * server action on mount, behind the shell's other mount-time actions (Next
 * runs a client's server actions one at a time), so the list waited 7 to 9 s
 * under "Cargando". Seeded to the client store; any failure is null and the
 * editor falls back to its own action.
 */
type ServicesLoadResult = Awaited<ReturnType<typeof loadTalentOfferingsForEditor>>;

export type ServicesBootstrap = {
  talentProfileId: string;
  result: Awaited<ReturnType<typeof loadTalentOfferingsForEditor>>;
} | null;

export async function loadServicesBootstrap(): Promise<ServicesBootstrap> {
  try {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return null;
    const identity = await resolveDashboardIdentity().catch(() => null);
    const ctx = effectiveReadContext(session.user.id, identity);
    const profile = await loadTalentSelfProfileByUser(readUserId(session.user.id, ctx));
    if (!profile) return null;
    // TUL-1113: the shared 2 s first-paint budget. Past it the page paints without the
    // seed and the editor loads its own list (same fallback as any other failure).
    const result = await withTimeout<ServicesLoadResult | null>(
      loadTalentOfferingsForEditor(profile.id),
      TALENT_LOADER_BUDGET_MS,
      null,
    );
    if (!result) return null;
    return { talentProfileId: profile.id, result };
  } catch {
    return null;
  }
}
