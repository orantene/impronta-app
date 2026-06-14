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

// ─── Editable template overrides (P3b) ───────────────────────────────────────

export type TemplateOverride = {
  catalogEntryId: string;
  locale: string;
  subject: string | null;
  body: string | null;
  enabled: boolean;
};
/** Keyed `${catalogEntryId}::${locale}`. */
export type TemplateOverrideMap = Map<string, TemplateOverride>;

let _tplCache: { at: number; map: TemplateOverrideMap } | null = null;

export function invalidateTemplateOverrideCache(): void {
  _tplCache = null;
}

export async function loadTemplateOverrides(
  admin?: SupabaseClient,
): Promise<TemplateOverrideMap> {
  const now = Date.now();
  if (_tplCache && now - _tplCache.at < TTL_MS) return _tplCache.map;

  const map: TemplateOverrideMap = new Map();
  const sb = admin ?? createServiceRoleClient();
  if (!sb) return map; // degrade-open

  try {
    const { data, error } = await sb
      .from("notification_template_override")
      .select("catalog_entry_id, locale, subject, body_markdown, enabled");
    if (error) {
      logServerError("notifications.templateOverride.load", error);
      return map;
    }
    for (const r of (data ?? []) as Array<{
      catalog_entry_id: string;
      locale: string;
      subject: string | null;
      body_markdown: string | null;
      enabled: boolean;
    }>) {
      map.set(`${r.catalog_entry_id}::${r.locale}`, {
        catalogEntryId: r.catalog_entry_id,
        locale: r.locale,
        subject: r.subject,
        body: r.body_markdown,
        enabled: r.enabled,
      });
    }
    _tplCache = { at: now, map };
  } catch (err) {
    logServerError("notifications.templateOverride.load", err);
  }
  return map;
}

/**
 * The effective override for an entry+locale: the locale-specific row if present,
 * else the `en` row as a base. Only returns an `enabled` row that has content.
 */
export function getTemplateOverride(
  map: TemplateOverrideMap,
  catalogEntryId: string,
  locale: string,
): TemplateOverride | null {
  const o = map.get(`${catalogEntryId}::${locale}`) ?? map.get(`${catalogEntryId}::en`) ?? null;
  if (!o || !o.enabled) return null;
  if (!o.subject?.trim() && !o.body?.trim()) return null;
  return o;
}

/**
 * Interpolate the small, safe placeholder set into override text. Values are
 * rendered as React text children downstream (auto-escaped), so this is XSS-safe
 * — it only substitutes known tokens; unknown `{{tokens}}` are left verbatim.
 */
export function interpolateOverride(
  text: string,
  vars: { name?: string | null; brand?: string | null },
): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/g, vars.name?.trim() || "there")
    .replace(/\{\{\s*brand\s*\}\}/g, vars.brand?.trim() || "");
}
