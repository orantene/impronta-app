"use server";

/**
 * user-prefs.ts — per-user preferences server actions + loader.
 *
 * Phase 5 (talent-surface launch plan) — toggle persistence + first-run tip.
 *
 * Table: public.user_prefs
 *   user_id UUID PK, preferred_surface TEXT, first_run_toggle_tip_seen BOOLEAN, updated_at TIMESTAMPTZ
 *
 * All writes are fire-and-forget from the client (no await needed). Errors
 * are logged server-side but never surface to the user — a pref write failure
 * is not critical and should not block the UI.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

export type UserPrefs = {
  preferredSurface: "talent" | "workspace" | null;
  firstRunToggleTipSeen: boolean;
};

/**
 * Load user prefs for a given userId. Uses server client (user RLS session)
 * when called from a layout. Returns null on error so callers degrade
 * gracefully to defaults.
 */
export async function loadUserPrefs(userId: string): Promise<UserPrefs | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("user_prefs")
      .select("preferred_surface, first_run_toggle_tip_seen")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // Swallow missing-table errors silently — user_prefs migration may not
      // have been applied yet. Defaults are fine.
      if ((error as { code?: string })?.code !== "PGRST205") {
        logServerError("user-prefs.loadUserPrefs", error);
      }
      return null;
    }

    if (!data) return null;

    const row = data as {
      preferred_surface: string | null;
      first_run_toggle_tip_seen: boolean;
    };

    return {
      preferredSurface:
        row.preferred_surface === "talent" || row.preferred_surface === "workspace"
          ? row.preferred_surface
          : null,
      firstRunToggleTipSeen: row.first_run_toggle_tip_seen ?? false,
    };
  } catch (err) {
    logServerError("user-prefs.loadUserPrefs", err);
    return null;
  }
}

/**
 * Persist the user's preferred surface. Fire-and-forget from the client.
 * Auth required — reads user from session cookie.
 */
export async function setPreferredSurface(
  surface: "talent" | "workspace",
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("user_prefs").upsert(
      {
        user_id: user.id,
        preferred_surface: surface,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      logServerError("user-prefs.setPreferredSurface", error);
    }
  } catch (err) {
    logServerError("user-prefs.setPreferredSurface", err);
  }
}

/**
 * Mark the first-run toggle tip as seen. Fire-and-forget from the client.
 * Auth required — reads user from session cookie.
 */
export async function markToggleTipSeen(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("user_prefs").upsert(
      {
        user_id: user.id,
        first_run_toggle_tip_seen: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      logServerError("user-prefs.markToggleTipSeen", error);
    }
  } catch (err) {
    logServerError("user-prefs.markToggleTipSeen", err);
  }
}
