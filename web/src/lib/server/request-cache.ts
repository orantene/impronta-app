import { cache } from "react";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadAccessProfile,
  type AccessProfileWithDisplayName,
} from "@/lib/access-profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-scoped Supabase server client (cookie session). Multiple RSC/action
 * calls in the same request reuse one client instance.
 */
export const getCachedServerSupabase = cache(createClient);

export type CachedActorSession =
  | {
      supabase: SupabaseClient;
      user: User;
      profile: AccessProfileWithDisplayName | null;
    }
  | {
      supabase: SupabaseClient;
      user: null;
      profile: null;
    }
  | {
      supabase: null;
      user: null;
      profile: null;
    };

/**
 * Sprint 2.1 — middleware writes the verified actor onto these internal
 * headers after running `getUser` + `loadAccessProfile`. Reading them
 * here lets `getCachedActorSession` skip a duplicate ~300–600 ms chain
 * on every server action. Header names + spoof-stripping live in
 * `web/src/lib/supabase/middleware.ts`.
 */
const ACTOR_ID_HEADER = "x-impronta-actor-id";
const ACTOR_EMAIL_HEADER = "x-impronta-actor-email";
const ACTOR_APP_ROLE_HEADER = "x-impronta-actor-app-role";
const ACTOR_STATUS_HEADER = "x-impronta-actor-status";
const ACTOR_ONBOARDED_HEADER = "x-impronta-actor-onboarded";

/**
 * Build a minimal Supabase `User`-shaped object from the middleware-supplied
 * actor identity. We pass `id` + `email` because dashboard surfaces (admin
 * page first-name resolver, dashboard layout impersonation banner) read
 * `user.email`. Other User fields (`app_metadata`, `user_metadata`,
 * `created_at`) are left as defaults — downstream callers that need them
 * are uncommon and would re-resolve through dedicated lookups.
 */
function syntheticUserFromHeaders(
  actorId: string,
  actorEmail: string | null,
): User {
  return {
    id: actorId,
    email: actorEmail ?? undefined,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "",
    role: "authenticated",
  } as unknown as User;
}

function profileFromHeaders(
  appRole: string | null,
  status: string | null,
  onboardedFlag: string | null,
): AccessProfileWithDisplayName | null {
  if (!appRole && !status) return null;
  return {
    app_role: (appRole as AccessProfileWithDisplayName["app_role"]) ?? null,
    account_status:
      (status as AccessProfileWithDisplayName["account_status"]) ?? null,
    onboarding_completed_at: onboardedFlag === "1" ? "1" : null,
  };
}

/**
 * Sprint 2.1 fast path — read the verified actor from middleware-set
 * headers. Returns null if middleware didn't run or didn't have a session;
 * caller falls back to a direct `auth.getUser` round-trip.
 */
async function tryActorFromForwardedHeaders(
  supabase: SupabaseClient,
): Promise<CachedActorSession | null> {
  try {
    const h = await headers();
    const actorId = h.get(ACTOR_ID_HEADER);
    if (!actorId) return null;
    const email = h.get(ACTOR_EMAIL_HEADER);
    const appRole = h.get(ACTOR_APP_ROLE_HEADER);
    const status = h.get(ACTOR_STATUS_HEADER);
    const onboarded = h.get(ACTOR_ONBOARDED_HEADER);
    return {
      supabase,
      user: syntheticUserFromHeaders(actorId, email),
      profile: profileFromHeaders(appRole, status, onboarded),
    };
  } catch {
    // `headers()` throws outside a request scope (e.g., during build).
    return null;
  }
}

/**
 * One `auth.getUser` + `loadAccessProfile` chain per request for the signed-in
 * actor. Safe for public layouts, headers, and dashboard identity (impersonation
 * still applied on top in {@link resolveDashboardIdentity}).
 *
 * Sprint 2.1 — fast path reads the actor from middleware-set headers,
 * eliminating a ~300–600 ms duplicate auth chain per server action.
 * Falls through to direct `getUser` + `loadAccessProfile` only when the
 * fast path is unavailable (middleware didn't run, or the request is
 * unauthenticated).
 */
export const getCachedActorSession = cache(
  async (): Promise<CachedActorSession> => {
    const supabase = await getCachedServerSupabase();
    if (!supabase) {
      return { supabase: null, user: null, profile: null };
    }

    const fastPath = await tryActorFromForwardedHeaders(supabase);
    if (fastPath) return fastPath;

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return { supabase, user: null, profile: null };
    }

    const profile = await loadAccessProfile(supabase, user.id);
    return { supabase, user, profile };
  },
);
