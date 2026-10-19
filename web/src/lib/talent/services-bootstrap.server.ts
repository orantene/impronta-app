import "server-only";

import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext, readUserId } from "@/lib/impersonation/effective-read";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";

/**
 * TUL-824: what the Servicios page needs for its FIRST paint, loaded by the
 * `/talent/services` route on the server. The client used to fire this as a
 * server action on mount, behind the shell's other mount-time actions (Next
 * runs a client's server actions one at a time), so the list waited 7 to 9 s
 * under "Cargando". Seeded to the client store; any failure is null and the
 * editor falls back to its own action.
 */
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
    const result = await loadTalentOfferingsForEditor(profile.id);
    return { talentProfileId: profile.id, result };
  } catch {
    return null;
  }
}
