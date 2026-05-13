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

/** F.12 — Full channel matrix per event. Email + push remain primary
 * (canonical signals); inApp/sms/digest extend the matrix for adopters
 * with richer surfaces. Old callers still passing { email, push } get
 * the other channels defaulted to undefined which the loader normalizes
 * back. */
export type NotificationChannelPrefs = {
  email: boolean;
  push: boolean;
  inApp?: boolean;
  sms?: boolean;
  digest?: boolean;
};

export type UserPrefs = {
  preferredSurface: "talent" | "workspace" | null;
  firstRunToggleTipSeen: boolean;
  notificationPrefs: Record<string, NotificationChannelPrefs>;
  privacyPrefs: PrivacyPrefs;
};

/**
 * F.11 — Privacy preferences. Required for GDPR/CCPA + day-to-day
 * comfort (who sees my phone, can I be DM'd, etc).
 */
export type PrivacyPrefs = {
  /** Suppress marketing email batches; transactional always sends. */
  marketingEmailOptOut: boolean;
  /** Who sees your full profile? agency_only hides from public directory. */
  profileVisibility: "public" | "agency_only" | "hidden";
  /** Who sees your phone number on shared profiles. */
  showPhone: "everyone" | "connections" | "never";
  /** Whether "Seen at HH:MM" receipts surface on outbound messages. */
  readReceiptsEnabled: boolean;
  /** Who can initiate a direct conversation. */
  dmControls: "open" | "trusted_clients_only" | "agency_only";
  /** Suppress product analytics tracking. */
  analyticsOptOut: boolean;
  /** ISO timestamp of last data export request — null when never. */
  dataExportRequestedAt: string | null;
};

// Note: NOT exported — Next.js forbids non-async exports in "use server"
// files. Used only by the loader below to fill in defaults for partial
// rows. If a UI consumer needs the defaults, move this const to a
// non-server-action module (e.g. ./user-prefs-types.ts).
const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  marketingEmailOptOut: false,
  profileVisibility: "public",
  showPhone: "connections",
  readReceiptsEnabled: true,
  dmControls: "open",
  analyticsOptOut: false,
  dataExportRequestedAt: null,
};

function normalizePrivacyPrefs(raw: unknown): PrivacyPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PRIVACY_PREFS;
  const o = raw as Partial<Record<keyof PrivacyPrefs, unknown>>;
  return {
    marketingEmailOptOut: o.marketingEmailOptOut === true,
    profileVisibility:
      o.profileVisibility === "agency_only" || o.profileVisibility === "hidden"
        ? o.profileVisibility
        : "public",
    showPhone:
      o.showPhone === "everyone" || o.showPhone === "never"
        ? o.showPhone
        : "connections",
    readReceiptsEnabled: o.readReceiptsEnabled !== false,
    dmControls:
      o.dmControls === "trusted_clients_only" || o.dmControls === "agency_only"
        ? o.dmControls
        : "open",
    analyticsOptOut: o.analyticsOptOut === true,
    dataExportRequestedAt:
      typeof o.dataExportRequestedAt === "string" ? o.dataExportRequestedAt : null,
  };
}

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
      .select("preferred_surface, first_run_toggle_tip_seen, notification_prefs, privacy_prefs")
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
      notification_prefs: Record<string, NotificationChannelPrefs> | null;
      privacy_prefs: unknown;
    };

    return {
      preferredSurface:
        row.preferred_surface === "talent" || row.preferred_surface === "workspace"
          ? row.preferred_surface
          : null,
      firstRunToggleTipSeen: row.first_run_toggle_tip_seen ?? false,
      notificationPrefs: row.notification_prefs ?? {},
      privacyPrefs: normalizePrivacyPrefs(row.privacy_prefs),
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

/**
 * Persist notification preferences. Fire-and-forget.
 * Auth required — reads user from session cookie.
 */
export async function setNotificationPrefs(
  prefs: Record<string, NotificationChannelPrefs>,
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("user_prefs").upsert(
      { user_id: user.id, notification_prefs: prefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    if (error) {
      logServerError("user-prefs.setNotificationPrefs", error);
    }
  } catch (err) {
    logServerError("user-prefs.setNotificationPrefs", err);
  }
}

/**
 * Load notification preferences for the current session user.
 * Returns empty object on error (caller uses defaults).
 */
export async function getNotificationPrefs(): Promise<Record<string, NotificationChannelPrefs>> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return {};

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};

    const { data, error } = await supabase
      .from("user_prefs")
      .select("notification_prefs")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) return {};
    return (data as { notification_prefs: Record<string, NotificationChannelPrefs> | null }).notification_prefs ?? {};
  } catch {
    return {};
  }
}

/**
 * F.11 — Persist privacy preferences for the current user.
 * Partial update: only provided keys overwrite. Missing keys keep their
 * current value (or fall to default if no row exists yet).
 */
export async function setPrivacyPrefs(
  patch: Partial<PrivacyPrefs>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // Read current value to merge — partial patch shouldn't clobber other
    // fields the user set previously.
    const { data: existing } = await supabase
      .from("user_prefs")
      .select("privacy_prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    const current = normalizePrivacyPrefs(
      (existing as { privacy_prefs?: unknown } | null)?.privacy_prefs,
    );
    const merged: PrivacyPrefs = { ...current, ...patch };

    const { error } = await supabase.from("user_prefs").upsert(
      { user_id: user.id, privacy_prefs: merged, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    if (error) {
      logServerError("user-prefs.setPrivacyPrefs", error);
      return { ok: false, error: "Couldn't save privacy preferences." };
    }
    return { ok: true };
  } catch (err) {
    logServerError("user-prefs.setPrivacyPrefs", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * F.11 — Record a data-export request. The actual export job is async
 * (sends an email with a download link); this just marks the request
 * timestamp so we can rate-limit ("you requested an export 6 hours ago,
 * try again later").
 */
export async function requestDataExport(): Promise<{ ok: boolean; error?: string }> {
  return setPrivacyPrefs({ dataExportRequestedAt: new Date().toISOString() });
}
