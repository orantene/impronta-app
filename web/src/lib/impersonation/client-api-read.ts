import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import {
  effectiveReadContext,
  resolveReadTarget,
  type EffectiveIdentityLike,
  type ReadDeps,
} from "@/lib/impersonation/effective-read";

/**
 * TUL-255. The shared resolver for client-portal API routes (`/api/client/*`).
 * Pages use `clientPageReadCtx`; the routes the portal calls from the browser
 * (thread switch, details tab, topbar badge) used to key on the staff actor and
 * so answered 403 or empty under a verified impersonation.
 *
 * Nothing here comes from the request. The identity is the verified
 * impersonation cookie (`resolveDashboardIdentity`), re-checked against the
 * session user by `effectiveReadContext`, and the admin client is handed out
 * only for a verified impersonation of exactly the returned `userId`
 * (`pickReadClient` inside `resolveReadTarget`). Callers are read-only GETs.
 */
export type ClientApiRead = {
  /** The effective client: the impersonation subject, else the session user. */
  userId: string;
  /** Client to read with: admin only for a verified impersonation, else the request's RLS client. */
  client: SupabaseClient;
  impersonated: boolean;
};

export type ClientApiReadDeps = ReadDeps & {
  sessionUserId: () => Promise<string | null>;
  identity: () => Promise<EffectiveIdentityLike | null>;
};

export const DEFAULT_CLIENT_API_READ_DEPS: ClientApiReadDeps = {
  rlsClient: () => createSupabaseServerClient(),
  adminClient: createServiceRoleClient,
  sessionUserId: async () => (await getCachedActorSession()).user?.id ?? null,
  identity: () => resolveDashboardIdentity().catch(() => null),
};

/** Null when signed out, when no client is available, or when the admin client is required and missing. */
export async function resolveClientApiRead(
  deps: ClientApiReadDeps = DEFAULT_CLIENT_API_READ_DEPS,
): Promise<ClientApiRead | null> {
  const sessionUserId = await deps.sessionUserId();
  if (!sessionUserId) return null;
  const ctx = effectiveReadContext(sessionUserId, await deps.identity());
  const target = await resolveReadTarget(ctx, deps);
  if (!target) return null;
  return {
    userId: target.userId,
    client: target.client,
    impersonated: target.userId !== sessionUserId,
  };
}
