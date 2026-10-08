import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  pickReadClient,
  readUserId,
  type EffectiveReadContext,
} from "@/lib/impersonation/effective-read";

/**
 * TUL-245. Saved talents and favourites for the EFFECTIVE user, for the client
 * portal layout. Kept apart from `public-discovery.ts` so the service client
 * stays out of the module public pages share.
 *
 * Without a context, or with one that is not a verified impersonation of this
 * session's actor, both read the actor's own rows through the RLS client, the
 * same query the signed-in branch of `getSavedTalentIds` / `getFavoriteTalentIds`
 * runs. Under a verified impersonation they read the target's rows through the
 * service client, always filtered by the target's id.
 */

/** The slice of the actor session these readers need (injectable). */
export type DiscoveryReadDeps = {
  session: () => Promise<{
    user: { id: string } | null;
    supabase: SupabaseClient | null;
  }>;
  adminClient: () => SupabaseClient | null;
};

const DEFAULT_DEPS: DiscoveryReadDeps = {
  session: () => getCachedActorSession(),
  adminClient: () => createServiceRoleClient(),
};

async function loadOwnTalentIds(
  table: "saved_talent" | "client_favorites",
  orderColumn: "created_at" | "added_at",
  ctx: EffectiveReadContext | undefined,
  deps: DiscoveryReadDeps,
): Promise<string[]> {
  const actor = await deps.session();
  if (!actor.user || !actor.supabase) return [];
  const userId = readUserId(actor.user.id, ctx);
  const client = pickReadClient({
    sessionUserId: actor.user.id,
    userId,
    ctx,
    rlsClient: actor.supabase,
    adminClient: deps.adminClient,
  });
  if (!client) return [];
  const { data, error } = await client
    .from(table)
    .select("talent_profile_id")
    .eq("client_user_id", userId)
    .order(orderColumn, { ascending: false });
  if (error) {
    logServerError(`discovery.effective.${table}`, error);
    return [];
  }
  return (
    (data as { talent_profile_id: string }[] | null)?.map((r) => r.talent_profile_id) ?? []
  );
}

export function loadSavedTalentIdsForContext(
  ctx?: EffectiveReadContext,
  deps: DiscoveryReadDeps = DEFAULT_DEPS,
): Promise<string[]> {
  return loadOwnTalentIds("saved_talent", "created_at", ctx, deps);
}

export function loadFavoriteTalentIdsForContext(
  ctx?: EffectiveReadContext,
  deps: DiscoveryReadDeps = DEFAULT_DEPS,
): Promise<string[]> {
  return loadOwnTalentIds("client_favorites", "added_at", ctx, deps);
}
