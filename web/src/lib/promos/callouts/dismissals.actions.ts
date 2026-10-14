"use server";

/**
 * Callout dismissal state, persisted in the EXISTING per-user store
 * `user_prefs.notification_prefs` (jsonb) under the key `promo_callouts`. No new
 * table. Same read-modify-write merge as user-prefs.ts `mergeNotificationPrefs`
 * (that helper is module-private, so the 10 lines are repeated here).
 */

import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { applyCalloutAction, budgetLeft, EMPTY_CALLOUT_STATE, isCalloutState, recordShown, type CalloutAction, type CalloutState, type CalloutType } from "./engine";

const KEY = "promo_callouts";
const TYPES: readonly CalloutType[] = ["cancellation", "empty_days", "lapsed_clients", "idle_service"];
const ACTIONS: readonly CalloutAction[] = ["snooze", "hide", "accept", "unhide"];

async function readAndWrite(mutate: (s: CalloutState) => CalloutState): Promise<CalloutState | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    // supabase-read-unchecked-ok: an auth error and "no user" both mean nothing to save
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    // A failed read must not be mistaken for "no prefs": upserting {} would wipe them.
    const { data: existing, error: readErr } = await supabase.from("user_prefs").select("notification_prefs").eq("user_id", user.id).maybeSingle();
    if (readErr) {
      logServerError("promos.callouts/read", readErr);
      return null;
    }
    const current = ((existing as { notification_prefs?: unknown } | null)?.notification_prefs as Record<string, unknown> | null | undefined) ?? {};
    const stored = current[KEY];
    const next = mutate(isCalloutState(stored) ? stored : EMPTY_CALLOUT_STATE);
    const { error } = await supabase.from("user_prefs").upsert(
      { user_id: user.id, notification_prefs: { ...current, [KEY]: next }, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) {
      logServerError("promos.callouts/write", error);
      return null;
    }
    return next;
  } catch (err) {
    logServerError("promos.callouts/write", err);
    return null;
  }
}

export async function loadCalloutState(): Promise<CalloutState> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return EMPTY_CALLOUT_STATE;
    // supabase-read-unchecked-ok: an auth error and "no user" both mean no state to show
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return EMPTY_CALLOUT_STATE;
    const { data, error } = await supabase.from("user_prefs").select("notification_prefs").eq("user_id", user.id).maybeSingle();
    if (error) {
      logServerError("promos.callouts/load", error);
      return EMPTY_CALLOUT_STATE;
    }
    const stored = ((data as { notification_prefs?: Record<string, unknown> | null } | null)?.notification_prefs ?? {})[KEY];
    return isCalloutState(stored) ? stored : EMPTY_CALLOUT_STATE;
  } catch (err) {
    logServerError("promos.callouts/load", err);
    return EMPTY_CALLOUT_STATE;
  }
}

export async function respondToCallout(type: string, action: string): Promise<void> {
  await requireNotImpersonating();
  await requireNotImpersonating();
  if (!(TYPES as readonly string[]).includes(type) || !(ACTIONS as readonly string[]).includes(action)) return;
  await readAndWrite((s) => applyCalloutAction(s, type as CalloutType, action as CalloutAction, new Date()));
}

/** Call once when a callout first renders that day, so the daily/weekly budget holds. */
export async function markCalloutShown(): Promise<void> {
  await requireNotImpersonating();
  await readAndWrite((s) => budgetLeft(s.shown, Date.now()) ? recordShown(s, new Date()) : s);
}
