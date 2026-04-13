import { cache } from "react";
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
 * One `auth.getUser` + `loadAccessProfile` chain per request for the signed-in
 * actor. Safe for public layouts, headers, and dashboard identity (impersonation
 * still applied on top in {@link resolveDashboardIdentity}).
 */
export const getCachedActorSession = cache(
  async (): Promise<CachedActorSession> => {
    const supabase = await getCachedServerSupabase();
    if (!supabase) {
      return { supabase: null, user: null, profile: null };
    }

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
