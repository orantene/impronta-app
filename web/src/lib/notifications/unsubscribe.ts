import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { logServerError } from "@/lib/server/safe-error";
import { NOTIFICATION_CATEGORIES } from "./categories";
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
 * RFC 8058 one-click target for the `List-Unsubscribe` header. Mail providers
 * (Gmail/Yahoo) POST here directly — no human click — so this points at the
 * `/api/unsubscribe` route handler, which applies the change immediately. The
 * human-facing footer link uses `buildUnsubscribeUrl` (the confirm page).
 */
export function buildUnsubscribeApiUrl(
  token: string,
  category: NotificationCategory,
): string {
  return `${siteUrl()}/api/unsubscribe/${encodeURIComponent(token)}?cat=${encodeURIComponent(category)}`;
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

// ─── Landing-page helpers (spec §8, Phase 6) ────────────────────────────────
//
// The `/unsubscribe/[token]` page is reached by an unauthenticated click from
// an email footer. The token is the only credential, so every helper here
// runs under the service-role client and treats the token as untrusted input.

export type UnsubscribeCategoryInfo = {
  category: NotificationCategory;
  label: string;
  required: boolean;
};

/**
 * Validate a raw `?cat=` query value against the known category set. Returns
 * null for a missing/unknown category (the page then shows an "invalid link"
 * state rather than mutating anything).
 */
export function parseUnsubscribeCategory(
  raw: string | null | undefined,
): UnsubscribeCategoryInfo | null {
  if (!raw) return null;
  const def = NOTIFICATION_CATEGORIES[raw as NotificationCategory] as
    | { id: NotificationCategory; label: string; required: boolean }
    | undefined;
  if (!def) return null;
  return { category: def.id, label: def.label, required: def.required };
}

/** Mask an email for display: `tina@example.com` → `t***@example.com`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
}

async function emailForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    // Email is display-only copy — never block the flow on it.
    return null;
  }
}

/**
 * Resolve the user behind an unsubscribe token, for the confirm screen. This
 * is a read — no mutation happens on GET, so a link prefetched by an email
 * scanner can't accidentally unsubscribe anyone.
 */
export async function resolveUnsubscribeRecipient(
  admin: SupabaseClient,
  token: string,
): Promise<{ userId: string; email: string | null } | null> {
  if (!token) return null;
  try {
    const { data, error } = await admin
      .from("user_prefs")
      .select("user_id")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (error || !data) return null;
    const userId = (data as { user_id: string }).user_id;
    return { userId, email: await emailForUser(admin, userId) };
  } catch (err) {
    logServerError(
      "notifications.unsubscribe.resolve",
      err instanceof Error ? err : new Error(String(err)),
    );
    return null;
  }
}

export type ApplyUnsubscribeResult =
  | { ok: true; email: string | null; info: UnsubscribeCategoryInfo }
  | {
      ok: false;
      reason: "invalid_token" | "invalid_category" | "required_category" | "write_failed";
    };

/**
 * Apply a one-click unsubscribe: flip `notification_prefs[category].email` to
 * false for the user behind the token, then rotate the token so the link
 * can't be replayed. Required categories are refused. Only invoked from the
 * POST server action — never on a GET render.
 */
export async function applyCategoryUnsubscribe(
  admin: SupabaseClient,
  token: string,
  rawCategory: string | null | undefined,
): Promise<ApplyUnsubscribeResult> {
  const info = parseUnsubscribeCategory(rawCategory);
  if (!info) return { ok: false, reason: "invalid_category" };
  if (info.required) return { ok: false, reason: "required_category" };
  if (!token) return { ok: false, reason: "invalid_token" };

  try {
    const { data, error } = await admin
      .from("user_prefs")
      .select("user_id, notification_prefs")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (error || !data) return { ok: false, reason: "invalid_token" };

    const row = data as { user_id: string; notification_prefs: unknown };
    const userId = row.user_id;
    const prefs =
      row.notification_prefs && typeof row.notification_prefs === "object"
        ? { ...(row.notification_prefs as Record<string, unknown>) }
        : {};
    const current = prefs[info.category];
    const existing =
      current && typeof current === "object"
        ? { ...(current as Record<string, unknown>) }
        : {};
    const nextPrefs = {
      ...prefs,
      [info.category]: { ...existing, email: false },
    };

    const { error: writeErr } = await admin
      .from("user_prefs")
      .update({ notification_prefs: nextPrefs, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (writeErr) {
      logServerError("notifications.unsubscribe.write", writeErr);
      return { ok: false, reason: "write_failed" };
    }

    // Capture the email for the confirmation copy BEFORE rotating the token.
    const email = await emailForUser(admin, userId);

    // Rotate the token so this link is single-use. A rotation failure does
    // not undo the unsubscribe — log and continue.
    const { error: rotateErr } = await admin.rpc("rotate_unsubscribe_token", {
      p_user_id: userId,
    });
    if (rotateErr) {
      logServerError("notifications.unsubscribe.rotate", rotateErr);
    }

    return { ok: true, email, info };
  } catch (err) {
    logServerError(
      "notifications.unsubscribe.apply",
      err instanceof Error ? err : new Error(String(err)),
    );
    return { ok: false, reason: "write_failed" };
  }
}
