import "server-only";

import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext } from "@/lib/impersonation/effective-read";
import { loadTalentActor } from "@/lib/messaging/talent-actor";
import { getCachedActorSession } from "@/lib/server/request-cache";

/**
 * The talent the booking record reads as: the same effective user the talent layout uses
 * (a verified impersonation resolves the talent being acted as; otherwise the session user).
 * Lives outside the "use server" action file on purpose: an action's signature and module
 * must never carry the read context (TUL-254, server-action-context.static.test.ts); the
 * context is built here, server side, from the verified cookie only.
 *
 * Read only: the profile lookup follows the layout's `limit(1)` rule and falls back to the
 * session client when no service client is configured. Mutations never use this.
 */
export async function loadRecordActor() {
  let ctx: ReturnType<typeof effectiveReadContext> | undefined;
  try {
    const session = await getCachedActorSession();
    if (session.user) {
      const identity = await resolveDashboardIdentity().catch(() => null);
      ctx = effectiveReadContext(session.user.id, identity);
    }
  } catch {
    ctx = undefined;
  }
  return loadTalentActor(ctx, undefined, { firstProfile: true, adminFallback: true });
}
