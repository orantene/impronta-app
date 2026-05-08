import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/activity.ts — workspace + per-inquiry activity feeds.
 *
 * Split out of `_data-bridge.ts` (rev 13). Both functions read
 * `inquiry_events` joined with profile/inquiry context.
 */

// ─── Recent activity feed (workspace overview) ───────────────────────────────

export type RecentActivityItem = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_role: string;
  inquiry_contact: string;
  inquiry_company: string | null;
  created_at: string;
};

/**
 * Load recent workspace activity from inquiry_events for the Overview page.
 * Joins inquiry context (contact_name, company) and actor profile display_name.
 * Returns the 10 most recent staff_only + participants events.
 */
export async function loadRecentActivity(
  tenantId: string,
): Promise<RecentActivityItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Fetch recent events with inquiry and actor profile context
    const { data, error } = await supabase
      .from("inquiry_events")
      .select(`
        id,
        event_type,
        actor_user_id,
        actor_role,
        created_at,
        inquiries!inner(contact_name, company, tenant_id)
      `)
      .eq("inquiries.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      logServerError("workspace.loadRecentActivity.events", error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Gather unique actor user IDs to look up display names
    type EventRow = {
      id: string;
      event_type: string;
      actor_user_id: string | null;
      actor_role: string;
      created_at: string;
      inquiries: { contact_name: string; company: string | null } | null;
    };
    const rows = data as unknown as EventRow[];

    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[])];
    const nameMap: Map<string, string> = new Map();

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameMap.set(p.id, p.display_name);
      }
    }

    return rows
      .filter((r) => r.inquiries)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        event_type: r.event_type,
        actor_name: r.actor_user_id ? (nameMap.get(r.actor_user_id) ?? null) : null,
        actor_role: r.actor_role,
        inquiry_contact: r.inquiries!.contact_name,
        inquiry_company: r.inquiries!.company,
        created_at: r.created_at,
      }));
  } catch (err) {
    logServerError("workspace.loadRecentActivity", err);
    return [];
  }
}

// ─── Inquiry activity feed (work detail page) ────────────────────────────────

export type InquiryActivityItem = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

/**
 * Load the most recent inquiry_events rows for a single inquiry.
 * Used by the work detail page activity panel.
 */
export async function loadInquiryActivity(
  tenantId: string,
  inquiryId: string,
  limit = 20,
): Promise<InquiryActivityItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiry_events")
      .select("id, event_type, actor_user_id, actor_role, created_at")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logServerError("workspace.loadInquiryActivity", error);
      return [];
    }
    if (!data?.length) return [];

    type EventRow = { id: string; event_type: string; actor_user_id: string | null; actor_role: string | null; created_at: string };
    const rows = data as EventRow[];
    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[])];
    const nameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameMap.set(p.id, p.display_name);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      actor_name: r.actor_user_id ? (nameMap.get(r.actor_user_id) ?? null) : null,
      actor_role: r.actor_role,
      created_at: r.created_at,
    }));
  } catch (err) {
    logServerError("workspace.loadInquiryActivity", err);
    return [];
  }
}
