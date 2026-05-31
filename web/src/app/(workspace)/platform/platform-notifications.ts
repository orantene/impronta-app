import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Platform-scoped (Tulala HQ) in-app notifications for the calling super_admin.
 *
 * Reads `user_notifications` rows with `tenant_id IS NULL` + `surface =
 * 'platform'` — the rows the dispatcher writes for platform-alert catalog
 * entries (new workspace, signup failed, …) addressed to super_admins. Access
 * is the existing user-scoped RLS policy (`user_id = auth.uid()`); tenant-scoped
 * readers filter `tenant_id = <id>`, so these never leak into a workspace.
 */
export type PlatformNotification = {
  id: string;
  kind: "message" | "offer" | "booking" | "payment" | "approval" | "system" | "profile";
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  ts: string;
};

export async function loadPlatformNotifications(
  limit = 12,
): Promise<PlatformNotification[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, kind, title, body, read_at, created_at")
      .eq("user_id", user.id)
      .is("tenant_id", null)
      .eq("surface", "platform")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logServerError("platform.notifications.load", error);
      return [];
    }

    return (
      (data ?? []) as Array<{
        id: string;
        kind: PlatformNotification["kind"];
        title: string;
        body: string | null;
        read_at: string | null;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      read: r.read_at !== null,
      createdAt: r.created_at,
      ts: relativeTs(r.created_at),
    }));
  } catch (err) {
    logServerError("platform.notifications.load", err);
    return [];
  }
}

function relativeTs(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
