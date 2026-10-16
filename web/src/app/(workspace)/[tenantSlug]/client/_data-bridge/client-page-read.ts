import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  pickReadClient,
  readUserId,
  type EffectiveReadContext,
} from "@/lib/impersonation/effective-read";
import {
  loadClientSelfProfile,
  type ClientSelfProfile,
} from "../../_data-bridge/clients";

/**
 * TUL-255. The one place every client-portal page resolves WHO it reads for
 * and WITH WHICH client, so a page cannot key a query on the staff actor while
 * a verified impersonation is active.
 *
 * `ctx` comes only from `effectiveReadContext` in the page (never a request).
 * It is re-checked here against the session user: a context built for another
 * actor, or one that does not claim impersonation, is dropped and the page
 * reads as the session user exactly as it did before.
 */
export type ClientPageBaseDeps = {
  profile: typeof loadClientSelfProfile;
  rlsClient: () => Promise<SupabaseClient | null>;
  adminClient: () => SupabaseClient | null;
};

export const DEFAULT_CLIENT_PAGE_BASE: ClientPageBaseDeps = {
  profile: loadClientSelfProfile,
  rlsClient: () => createSupabaseServerClient(),
  adminClient: createServiceRoleClient,
};

export type ClientPageRead = {
  /** The id every read is keyed on: the subject under impersonation, else the session user. */
  userId: string;
  /** Verified context, or undefined when the page is reading as the session user. */
  ctx: EffectiveReadContext | undefined;
  impersonated: boolean;
  /**
   * The admin client, set ONLY for a verified impersonation (RLS would deny the
   * staff actor the subject's rows). Undefined otherwise, so loaders keep
   * opening their own request client exactly as before.
   */
  readClient: SupabaseClient | undefined;
  profile: ClientSelfProfile;
};

/** Drop any context that does not belong to this session user. */
export function trustedCtx(
  sessionUserId: string,
  ctx: EffectiveReadContext | undefined,
): EffectiveReadContext | undefined {
  return ctx && ctx.impersonated && ctx.actorUserId === sessionUserId ? ctx : undefined;
}

/**
 * Resolve the effective user, the read client and the client profile gate.
 * Null (the page's notFound) when there is no profile for the effective user,
 * or when a verified impersonation needs the admin client and it is missing.
 */
export async function resolveClientPageRead(
  sessionUserId: string,
  tenantId: string,
  rawCtx: EffectiveReadContext | undefined,
  deps: ClientPageBaseDeps = DEFAULT_CLIENT_PAGE_BASE,
): Promise<ClientPageRead | null> {
  const ctx = trustedCtx(sessionUserId, rawCtx);
  const userId = readUserId(sessionUserId, ctx);
  let readClient: SupabaseClient | undefined;
  if (ctx) {
    const rls = await deps.rlsClient();
    if (!rls) return null;
    const picked = pickReadClient({
      sessionUserId,
      userId,
      ctx,
      rlsClient: rls,
      adminClient: deps.adminClient,
    });
    if (!picked) return null;
    readClient = picked;
  }
  const profile = await deps.profile(userId, tenantId, ctx);
  if (!profile) return null;
  return { userId, ctx, impersonated: ctx !== undefined, readClient, profile };
}
