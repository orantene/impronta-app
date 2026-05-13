import "server-only";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

/**
 * A.3 — Defensive auth guard for `_data-bridge` server-side loaders.
 *
 * Most bridge functions trust the calling layout's scope check + the
 * Supabase user RLS surface. That's correct in 99% of cases — but a
 * drawer that imports a bridge function directly (skipping the layout)
 * or a future refactor that moves a bridge call to a context where
 * `getCachedActorSession()` returns null could leak data.
 *
 * `guardedQuery` makes the auth check explicit: it resolves the actor
 * session up front, hands the inner query the session, and returns
 * null (with a logged warning) when no session is present. Callers
 * already handle null bridge data with `notFound()` / empty arrays —
 * a null from a failed guard degrades to the same state, not a crash.
 *
 * Adoption is incremental: existing `loadX()` functions can be wrapped
 * in `guardedQuery()` one at a time without changing signatures. The
 * inner function continues to do its supabase work; the wrapper just
 * adds a defensive perimeter check + uniform logging.
 *
 * Required role hints:
 *   - "staff"   — caller expects a workspace staff member; null when not
 *   - "client"  — caller expects an authenticated client user
 *   - "talent"  — caller expects an authenticated talent user
 *   - "any"     — any authenticated user is acceptable (use sparingly)
 *
 * The hint is metadata for logging + future role-aware policies; the
 * current implementation only enforces "session present, user present".
 * Per-role validation happens inside the inner function via RLS.
 */

export type GuardedActorContext = {
  userId: string;
};

export type GuardedRequiredRole = "staff" | "client" | "talent" | "any";

export async function guardedQuery<T>(
  context: string,
  required: GuardedRequiredRole,
  fn: (auth: GuardedActorContext) => Promise<T>,
): Promise<T | null> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) {
      logServerError(
        `guardedQuery.${context}`,
        new Error(`Unauthenticated bridge read (required=${required})`),
      );
      return null;
    }
    return await fn({ userId: session.user.id });
  } catch (err) {
    logServerError(`guardedQuery.${context}`, err);
    return null;
  }
}
