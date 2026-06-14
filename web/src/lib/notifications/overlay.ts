import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Admin overlay on the CODE notification catalog (P3b). Layers per-entry channel
 * enable/disable on top of the code defaults, read by the dispatcher before it
 * sends. NULL / absent = use the code default (channel on); only an explicit
 * `false` disables a channel — and only for non-`required` (opt-out-able)
 * entries (the dispatcher never disables a required transactional notice).
 *
 * Cached briefly so the dispatcher pays at most one read per ~60s, and degrades
 * OPEN: any read error yields an empty overlay (everything on), so a DB blip can
 * never silently black-hole notifications.
 */

export type NotificationOverlayMap = Map<
  string,
  { email: boolean | null; in_app: boolean | null }
>;

const TTL_MS = 60_000;
let _cache: { at: number; map: NotificationOverlayMap } | null = null;

export function invalidateNotificationOverlayCache(): void {
  _cache = null;
}

export async function loadNotificationOverlay(
  admin?: SupabaseClient,
): Promise<NotificationOverlayMap> {
  const now = Date.now();
  if (_cache && now - _cache.at < TTL_MS) return _cache.map;

  const map: NotificationOverlayMap = new Map();
  const sb = admin ?? createServiceRoleClient();
  if (!sb) return map; // degrade-open (no caching — try again next call)

  try {
    const { data, error } = await sb
      .from("notification_overlay")
      .select("catalog_entry_id, email_enabled, in_app_enabled");
    if (error) {
      logServerError("notifications.overlay.load", error);
      return map; // degrade-open, don't cache the failure
    }
    for (const r of (data ?? []) as Array<{
      catalog_entry_id: string;
      email_enabled: boolean | null;
      in_app_enabled: boolean | null;
    }>) {
      map.set(r.catalog_entry_id, { email: r.email_enabled, in_app: r.in_app_enabled });
    }
    _cache = { at: now, map };
  } catch (err) {
    logServerError("notifications.overlay.load", err);
  }
  return map;
}

/**
 * Whether a channel is enabled for an entry. Enabled unless the overlay
 * explicitly sets it `false`; an absent row or NULL column means "on".
 */
export function isChannelEnabled(
  map: NotificationOverlayMap,
  catalogEntryId: string,
  channel: "email" | "in_app",
): boolean {
  const o = map.get(catalogEntryId);
  if (!o) return true;
  const v = channel === "email" ? o.email : o.in_app;
  return v !== false;
}
