import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import type { NotificationCategory } from "./types";

/**
 * One-click unsubscribe helpers (spec §8, decision D4).
 *
 * Each user carries a single `unsubscribe_token` (rotated on use). The
 * unsubscribe link is per-category: clicking it disables email for that one
 * category, never the account. The page lives on the platform host — the
 * token is global, so we always build it against the platform site URL, not
 * the tenant's vanity domain.
 *
 * Required categories (account_security, billing) never get an unsubscribe
 * link — callers gate on `entry.required` before invoking these.
 */

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://${PLATFORM_BRAND.domain}`
  ).replace(/\/$/, "");
}

export function buildUnsubscribeUrl(
  token: string,
  category: NotificationCategory,
): string {
  return `${siteUrl()}/unsubscribe/${encodeURIComponent(token)}?cat=${encodeURIComponent(category)}`;
}

/**
 * Look up a user's current unsubscribe token. Returns null when the user has
 * no prefs row or the column doesn't exist yet (pre-migration) — the caller
 * then simply omits the unsubscribe link.
 */
export async function getUnsubscribeToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("user_prefs")
      .select("unsubscribe_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const token = (data as { unsubscribe_token?: string | null }).unsubscribe_token;
    return token ?? null;
  } catch {
    return null;
  }
}
