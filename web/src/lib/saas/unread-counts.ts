import "server-only";

/**
 * unread-counts.ts — Cross-mode unread message counters for hybrid users.
 *
 * Phase 5 (talent-surface launch plan) — provides:
 *   loadTalentUnreadCount(talentProfileId, tenantId)
 *     → count of unread messages in the talent's personal inquiry threads.
 *   loadWorkspaceUnreadCount(tenantId)
 *     → re-exports the existing loadTotalUnreadMessages from the workspace bridge.
 *
 * Both are exposed here so each layout has a single named import rather than
 * reaching into the workspace bridge from the talent layout (which would create
 * an odd cross-surface dependency).
 *
 * Design: uses the same watermark strategy as loadTotalUnreadMessages — read
 * inquiry_message_reads for last_read_at per inquiry, then count messages
 * created after that watermark by other senders.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

// Re-export the workspace counter so both layouts import from one place.
export { loadTotalUnreadMessages as loadWorkspaceUnreadCount } from "@/app/(workspace)/[tenantSlug]/_data-bridge";

const INQUIRY_CLOSED_STATUSES = ["rejected", "expired"];

/**
 * Count unread messages in the talent's personal inquiry threads.
 *
 * Talent-scoped: only counts group-thread messages on inquiries where
 * this talent is a participant (via inquiry_participants). This is
 * intentionally narrower than loadWorkspaceUnreadCount, which counts
 * all workspace inquiries regardless of participant.
 *
 * Returns 0 on any error — never throws.
 */
export async function loadTalentUnreadCount(
  talentProfileId: string,
  tenantId: string,
): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return 0;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;
    if (!myUserId) return 0;

    // Step 1 — get inquiry IDs for this talent (non-closed only)
    const { data: participantRows, error: partErr } = await supabase
      .from("inquiry_participants")
      .select(`
        inquiries!inner ( id, status, tenant_id )
      `)
      .eq("talent_profile_id", talentProfileId)
      .eq("inquiries.tenant_id", tenantId)
      .not("inquiries.status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`);

    if (partErr) {
      logServerError("unread-counts.loadTalentUnreadCount.participants", partErr);
      return 0;
    }

    type PartRow = { inquiries: { id: string; status: string } | null };
    const inquiryIds = ((participantRows ?? []) as unknown as PartRow[])
      .map((r) => r.inquiries?.id)
      .filter((id): id is string => !!id);

    if (inquiryIds.length === 0) return 0;

    // Step 2 — parallel: read watermarks + messages
    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, last_read_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", myUserId)
        .eq("thread_type", "group")
        .in("inquiry_id", inquiryIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, sender_user_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("thread_type", "group")
        .is("deleted_at", null)
        .neq("sender_user_id", myUserId)
        .in("inquiry_id", inquiryIds),
    ]);

    if (readsRes.error) {
      logServerError("unread-counts.loadTalentUnreadCount.reads", readsRes.error);
    }
    if (messagesRes.error) {
      logServerError("unread-counts.loadTalentUnreadCount.messages", messagesRes.error);
      return 0;
    }

    const readAtMap = new Map<string, string>();
    for (const r of (readsRes.data ?? []) as {
      inquiry_id: string;
      last_read_at: string | null;
    }[]) {
      if (r.last_read_at) readAtMap.set(r.inquiry_id, r.last_read_at);
    }

    let total = 0;
    for (const m of (messagesRes.data ?? []) as {
      inquiry_id: string;
      created_at: string;
    }[]) {
      const lastRead = readAtMap.get(m.inquiry_id);
      if (!lastRead || new Date(m.created_at).getTime() > new Date(lastRead).getTime()) {
        total += 1;
      }
    }
    return total;
  } catch (err) {
    logServerError("unread-counts.loadTalentUnreadCount", err);
    return 0;
  }
}
