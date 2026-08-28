import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Notification row as surfaced in the NotificationsDrawer.
 *
 * The DB shape (`user_notifications`) is normalised to a UI-shaped struct
 * here so the drawer doesn't have to know about underlying column names.
 */
export type UserNotification = {
  id: string;
  kind: "message" | "offer" | "booking" | "payment" | "approval" | "system" | "profile" | "ticket";
  surface: "workspace" | "talent" | "client";
  title: string;
  body: string | null;
  actorInitials: string | null;
  targetDrawer: string | null;
  targetPayload: Record<string, unknown> | null;
  originInquiryId: string | null;
  read: boolean;
  ts: string;
  createdAt: string;
};

const NOTIFICATION_PAGE_SIZE = 50;

/**
 * Load the calling user's notifications for a tenant. Newest first.
 * Returns an empty array on error or when nothing exists yet.
 */
export async function loadUserNotifications(
  tenantId: string,
  surface?: "workspace" | "talent" | "client",
): Promise<UserNotification[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from("user_notifications")
      .select(
        "id, kind, surface, title, body, actor_initials, target_drawer, target_payload, origin_inquiry_id, read_at, created_at",
      )
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE);

    if (surface) query = query.eq("surface", surface);

    const { data, error } = await query;
    if (error) {
      logServerError("notifications.load", error);
      return [];
    }

    return (data ?? []).map(mapNotificationRow);
  } catch (err) {
    logServerError("notifications.load", err);
    return [];
  }
}

/**
 * Load the calling user's TALENT-surface notifications, newest first, across
 * every agency they are rostered on.
 *
 * Deliberately NOT tenant-scoped, unlike `loadUserNotifications`. The talent
 * shell already loads its inquiries with `loadTalentInquiriesAllAgencies` for
 * the same reason: a talent on two rosters has one inbox, not one per agency,
 * and the shell's "active agency" is a display context, not a data boundary.
 * Scoping here would silently hide rows whenever the talent switched agencies
 * (production already has a user whose talent notifications span two tenants).
 *
 * Rows stay scoped to the caller by the explicit `user_id` filter plus RLS.
 * Returns an empty array on error or when nothing exists yet.
 */
export async function loadTalentSurfaceNotifications(): Promise<UserNotification[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("user_notifications")
      .select(
        "id, kind, surface, title, body, actor_initials, target_drawer, target_payload, origin_inquiry_id, read_at, created_at",
      )
      .eq("user_id", user.id)
      .eq("surface", "talent")
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE);

    if (error) {
      logServerError("notifications.loadTalentSurface", error);
      return [];
    }
    return (data ?? []).map(mapNotificationRow);
  } catch (err) {
    logServerError("notifications.loadTalentSurface", err);
    return [];
  }
}

type NotificationRow = {
  id: string;
  kind: UserNotification["kind"];
  surface: UserNotification["surface"];
  title: string;
  body: string | null;
  actor_initials: string | null;
  target_drawer: string | null;
  target_payload: Record<string, unknown> | null;
  origin_inquiry_id: string | null;
  read_at: string | null;
  created_at: string;
};

function mapNotificationRow(r: NotificationRow): UserNotification {
  return {
    id: r.id,
    kind: r.kind,
    surface: r.surface,
    title: r.title,
    body: r.body,
    actorInitials: r.actor_initials,
    targetDrawer: r.target_drawer,
    targetPayload: r.target_payload,
    originInquiryId: r.origin_inquiry_id,
    read: r.read_at !== null,
    ts: relativeTs(r.created_at),
    createdAt: r.created_at,
  };
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
