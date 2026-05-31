import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { NOTIFICATION_CATEGORIES } from "./categories";
import { isEmailSuppressed } from "./suppressions";
import {
  LIVE_CHANNELS,
  type AudienceContext,
  type CatalogEntry,
  type NotificationCategory,
  type NotificationChannel,
  type ResolvedRecipient,
} from "./types";

/**
 * Per-category preference resolution + the channel-selection policy (spec
 * §2.4). The dispatcher asks `channelsForRecipient` which live channels a
 * given recipient should actually receive for a given catalog entry.
 *
 * Preferences live in `user_prefs.notification_prefs` (jsonb), keyed by
 * category id. We read it defensively as untyped json so the dispatcher is
 * never coupled to a specific value shape — the prefs UI (Phase 6) owns the
 * write shape. We also accept the legacy `inApp` channel key alongside the
 * canonical `in_app`.
 */

type ChannelToggleMap = Partial<Record<NotificationChannel, boolean>>;

/** Default channel toggles for a category (used when the user hasn't customized). */
export function defaultsFor(category: NotificationCategory): ChannelToggleMap {
  const out: ChannelToggleMap = {};
  for (const channel of NOTIFICATION_CATEGORIES[category].defaultChannels) {
    out[channel] = true;
  }
  return out;
}

function normalizeCategoryPrefs(raw: Record<string, unknown>): ChannelToggleMap {
  const out: ChannelToggleMap = {};
  const readBool = (...keys: string[]): boolean | undefined => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === "boolean") return value;
    }
    return undefined;
  };

  const email = readBool("email");
  if (email !== undefined) out.email = email;
  const inApp = readBool("in_app", "inApp");
  if (inApp !== undefined) out.in_app = inApp;
  const push = readBool("push");
  if (push !== undefined) out.push = push;
  const sms = readBool("sms");
  if (sms !== undefined) out.sms = sms;
  const whatsapp = readBool("whatsapp");
  if (whatsapp !== undefined) out.whatsapp = whatsapp;

  return out;
}

async function loadRawNotificationPrefs(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await admin
      .from("user_prefs")
      .select("notification_prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return {};
    const prefs = (data as { notification_prefs?: unknown }).notification_prefs;
    return prefs && typeof prefs === "object"
      ? (prefs as Record<string, unknown>)
      : {};
  } catch (err) {
    logServerError(
      "notifications.prefs.load",
      err instanceof Error ? err : new Error(String(err)),
    );
    return {};
  }
}

/** Resolved channel toggles for one user + category, falling back to defaults. */
export async function getCategoryPrefs(
  admin: SupabaseClient,
  userId: string,
  category: NotificationCategory,
): Promise<ChannelToggleMap> {
  const all = await loadRawNotificationPrefs(admin, userId);
  const raw = all[category];
  if (!raw || typeof raw !== "object") return defaultsFor(category);
  return normalizeCategoryPrefs(raw as Record<string, unknown>);
}

/**
 * The channel-selection policy. Given a catalog entry and a hydrated
 * recipient, return the live channels to dispatch on.
 *
 *  1. Start from the entry's default channels, restricted to channels with a
 *     live handler today (email, in_app).
 *  2. Guests can only be reached by email (no in-app surface / account).
 *  3. Required categories (account_security, billing) bypass prefs entirely.
 *  4. Otherwise honor per-category toggles — an absent toggle means "on"
 *     (the channel is a default), an explicit `false` drops it.
 *  5. Finally, drop email if the destination address is suppressed.
 */
export async function channelsForRecipient(
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  ctx: AudienceContext,
): Promise<NotificationChannel[]> {
  let channels = entry.defaultChannels.filter((c) => LIVE_CHANNELS.includes(c));

  if (recipient.userId === null) {
    channels = channels.filter((c) => c === "email");
  } else if (!entry.required) {
    const prefs = await getCategoryPrefs(ctx.admin, recipient.userId, entry.category);
    channels = channels.filter((c) => prefs[c] !== false);
  }

  if (channels.includes("email")) {
    const suppressed = await isEmailSuppressed(ctx.admin, recipient.userId, recipient.email);
    if (suppressed) channels = channels.filter((c) => c !== "email");
  }

  return channels;
}
