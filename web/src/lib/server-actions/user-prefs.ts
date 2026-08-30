"use server";

/**
 * user-prefs.ts — per-user preferences server actions + loader.
 *
 * Phase 5 (talent-surface launch plan) — toggle persistence + first-run tip.
 *
 * Table: public.user_prefs
 *   user_id UUID PK, first_run_toggle_tip_seen BOOLEAN, updated_at TIMESTAMPTZ
 *
 * All writes are fire-and-forget from the client (no await needed). Errors
 * are logged server-side but never surface to the user — a pref write failure
 * is not critical and should not block the UI.
 *
 * EXCEPT `preferredSurface`, which lives on `profiles.home_surface_preference`.
 * `user_prefs.preferred_surface` held the same value and drifted from routing:
 * middleware resolves the landing surface from `profiles` (free, it already
 * fetches the row) and never read `user_prefs`, so toggling to Workspace in the
 * shell did not change where login put you. Reading and writing the profiles
 * column keeps the toggle and the router on one answer. Deprecated mirror +
 * backfill: migration 20261226000008.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import {
  loadHomePreference,
  saveHomePreference,
} from "@/lib/tulala/structure-model.server";

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
  /** True once the talent dismissed the Day-1 checklist on /talent/today. */
  talentChecklistDismissed: boolean;
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

    // Two reads because the surface preference lives on `profiles` (see the
    // module header) and everything else lives on `user_prefs`. Parallel, so
    // this costs one round-trip, and either side may be absent. The profiles
    // read goes through the structure-model loader rather than a second raw
    // `.from()` here: that module owns the column and already validates it.
    const [prefsRes, storedHome] = await Promise.all([
      supabase
        .from("user_prefs")
        .select("first_run_toggle_tip_seen, talent_checklist_dismissed, notification_prefs, privacy_prefs")
        .eq("user_id", userId)
        .maybeSingle(),
      loadHomePreference(userId),
    ]);
    const { data, error } = prefsRes;

    if (error) {
      // Swallow missing-table errors silently — user_prefs migration may not
      // have been applied yet. Defaults are fine.
      if ((error as { code?: string })?.code !== "PGRST205") {
        logServerError("user-prefs.loadUserPrefs", error);
      }
      return null;
    }

    // `client` is a valid home but not a shell surface, so it reads as "no
    // toggle preference" here rather than being coerced into one.
    const preferredSurface =
      storedHome === "talent" || storedHome === "workspace" ? storedHome : null;

    // A missing `user_prefs` row is not a missing preference: the surface
    // choice now lives elsewhere, so returning null here would silently drop a
    // real answer for any user who chose a home but never touched a toggle.
    if (!data) {
      return preferredSurface === null
        ? null
        : {
            preferredSurface,
            firstRunToggleTipSeen: false,
            talentChecklistDismissed: false,
            notificationPrefs: {},
            privacyPrefs: DEFAULT_PRIVACY_PREFS,
          };
    }

    const row = data as {
      first_run_toggle_tip_seen: boolean;
      talent_checklist_dismissed: boolean | null;
      notification_prefs: Record<string, NotificationChannelPrefs> | null;
      privacy_prefs: unknown;
    };

    return {
      preferredSurface,
      firstRunToggleTipSeen: row.first_run_toggle_tip_seen ?? false,
      talentChecklistDismissed: row.talent_checklist_dismissed ?? false,
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
 *
 * Writes `profiles.home_surface_preference`, so flipping the in-shell toggle
 * also moves where login lands. Writing `user_prefs.preferred_surface` instead
 * is what made the toggle forget itself across sessions.
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

    const saved = await saveHomePreference(user.id, surface);
    if (!saved.ok) {
      logServerError("user-prefs.setPreferredSurface", new Error(saved.error));
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
 * Mark the talent Day-1 first-session checklist as dismissed. Fire-and-forget
 * from the client. Auth required — reads user from session cookie.
 */
export async function markTalentChecklistDismissed(): Promise<void> {
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
        talent_checklist_dismissed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      logServerError("user-prefs.markTalentChecklistDismissed", error);
    }
  } catch (err) {
    logServerError("user-prefs.markTalentChecklistDismissed", err);
  }
}

/**
 * Read-modify-write merge into `user_prefs.notification_prefs`.
 *
 * `notification_prefs` is a shared jsonb blob: the legacy admin/client panels
 * key it by *event* (`booking-confirmed`, `new_message`, …) while the
 * notification engine's per-category panel keys it by *category* (`offers`,
 * `bookings`, …). These are disjoint key namespaces that must coexist in one
 * column, so we merge rather than overwrite — otherwise saving on one surface
 * would wipe the other's keys. Mirrors `setPrivacyPrefs` below. Errors are
 * logged, never surfaced (a pref write is non-critical).
 *
 * `user_prefs` is keyed by `user_id`, not tenant — the raw `.from` calls are
 * intentionally un-tenanted (grandfathered in eslint-suppressions.json).
 */
async function mergeNotificationPrefs(patch: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from("user_prefs")
      .select("notification_prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    const current =
      ((existing as { notification_prefs?: unknown } | null)?.notification_prefs as
        | Record<string, unknown>
        | null
        | undefined) ?? {};

    const { error } = await supabase.from("user_prefs").upsert(
      {
        user_id: user.id,
        notification_prefs: { ...current, ...patch },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) logServerError("user-prefs.mergeNotificationPrefs", error);
  } catch (err) {
    logServerError("user-prefs.mergeNotificationPrefs", err);
  }
}

/**
 * Persist notification preferences. Fire-and-forget. Auth required.
 * Merge semantics — see `mergeNotificationPrefs`.
 */
export async function setNotificationPrefs(
  prefs: Record<string, NotificationChannelPrefs>,
): Promise<void> {
  await mergeNotificationPrefs(prefs);
}

/**
 * Per-category notification channel toggles — the canonical shape the
 * notification engine reads (`lib/notifications/prefs.ts` →
 * `getCategoryPrefs`). Keyed by `NotificationCategory` id; each value carries
 * the live channels (`email`, `in_app`). An absent channel key means "use the
 * category default"; an explicit `false` is an opt-out.
 */
export type CategoryNotificationPrefs = {
  email?: boolean;
  in_app?: boolean;
};

/**
 * Persist per-category notification preferences written by the engine's
 * preferences panel. Fire-and-forget. Merge semantics — only the supplied
 * category keys are touched, so the legacy event-keyed entries (and any
 * categories the panel didn't render) are preserved.
 */
export async function setCategoryNotificationPrefs(
  catPrefs: Record<string, CategoryNotificationPrefs>,
): Promise<void> {
  await mergeNotificationPrefs(catPrefs);
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
