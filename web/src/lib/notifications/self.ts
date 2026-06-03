import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Self-service notification reads for the *current* surface shells (client,
 * talent, admin). This is the shared CONTRACT consumed by the role shells:
 *
 *   loadMyNotifications(limit?)  -> recipient's own notifications, newest first
 *   markNotificationsRead(ids)   -> mark some / all of them read
 *
 * Both are scoped to the authenticated auth user (RLS on `user_notifications`
 * limits rows to `user_id = auth.uid()`), so no tenant id is required from the
 * caller. `href` is computed here so the shells can deep-link straight to the
 * originating inquiry for whichever role the notification was raised on.
 */

export type MyNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type RawRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  surface: string | null;
  origin_inquiry_id: string | null;
  target_drawer: string | null;
  tenant_id: string | null;
  created_at: string;
  read_at: string | null;
};

/**
 * Load the calling user's notifications across all surfaces, newest first.
 * Returns [] on any error (notifications are never a hard-fail surface).
 */
export async function loadMyNotifications(
  limit: number = DEFAULT_LIMIT,
): Promise<MyNotification[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const safeLimit = Math.min(Math.max(1, Math.trunc(limit) || DEFAULT_LIMIT), MAX_LIMIT);

    const { data, error } = await supabase
      .from("user_notifications")
      .select(
        "id, kind, title, body, surface, origin_inquiry_id, target_drawer, tenant_id, created_at, read_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      logServerError("notifications.self.load", error);
      return [];
    }

    const rows = (data ?? []) as RawRow[];
    if (rows.length === 0) return [];

    // Resolve tenant slugs in one batch so we can build per-role hrefs.
    const tenantIds = Array.from(
      new Set(rows.map((r) => r.tenant_id).filter((t): t is string => !!t)),
    );
    const slugByTenant = await loadTenantSlugs(supabase, tenantIds);

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      href: buildHref(r, slugByTenant),
      createdAt: r.created_at,
      readAt: r.read_at,
    }));
  } catch (err) {
    logServerError("notifications.self.load", err);
    return [];
  }
}

/**
 * Mark a set of the caller's notifications read — or all of them when passed
 * the literal `'all'`. Idempotent; only the caller's own rows are touched
 * (RLS scopes the UPDATE to `user_id = auth.uid()`).
 */
export async function markNotificationsRead(
  ids: string[] | "all",
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const nowIso = new Date().toISOString();

    let query = supabase
      .from("user_notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (ids !== "all") {
      const cleaned = Array.from(new Set(ids.filter((id) => typeof id === "string" && id)));
      if (cleaned.length === 0) return { ok: true };
      query = query.in("id", cleaned);
    }

    const { error } = await query;
    if (error) {
      logServerError("notifications.self.markRead", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("notifications.self.markRead", err);
    return { ok: false };
  }
}

// --- internals ---------------------------------------------------------------

async function loadTenantSlugs(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tenantIds.length === 0) return map;
  try {
    const { data } = await supabase
      .from("agencies")
      .select("id, slug")
      .in("id", tenantIds);
    for (const row of (data ?? []) as Array<{ id: string; slug: string }>) {
      if (row.id && row.slug) map.set(row.id, row.slug);
    }
  } catch {
    // best-effort; missing slugs simply yield a null href below.
  }
  return map;
}

/**
 * Deep-link a notification to the originating inquiry for the recipient's role.
 *
 * Routes follow the workspace shell:
 *   admin   -> /<slug>/admin/messages?inquiry=<id>
 *   client  -> /<slug>/client/messages?inquiry=<id>
 *   talent  -> /<slug>/talent/inbox?inquiry=<id>
 *
 * Platform-surface notifications (no tenant) point at the platform console.
 */
function buildHref(row: RawRow, slugByTenant: Map<string, string>): string | null {
  const surface = row.surface ?? "";

  if (surface === "platform") {
    return "/platform/admin";
  }

  const slug = row.tenant_id ? slugByTenant.get(row.tenant_id) : undefined;
  if (!slug) return null;

  const base =
    surface === "talent"
      ? `/${slug}/talent/inbox`
      : surface === "client"
        ? `/${slug}/client/messages`
        : `/${slug}/admin/messages`;

  if (row.origin_inquiry_id) {
    return `${base}?inquiry=${encodeURIComponent(row.origin_inquiry_id)}`;
  }
  return base;
}
