import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "@/lib/support/support-from";
import { mapTicketRow, type SupportTicketRow, type SupportTicketSummary } from "@/lib/support/support-types";

export async function loadSupportTicketSummaries(
  userId: string,
  opts?: { tenantId?: string | null; workspaceAll?: boolean },
): Promise<SupportTicketSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    let query = supportFrom(supabase, "support_tickets")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(40);
    if (opts?.workspaceAll && opts.tenantId) {
      query = query.eq("tenant_id", opts.tenantId).eq("surface", "workspace");
    } else {
      query = query.eq("requester_user_id", userId);
    }
    const { data, error } = await query;
    if (error) {
      logServerError("support.loadSummaries", error);
      return [];
    }
    const tickets = ((data ?? []).map(mapTicketRow).filter(Boolean) as SupportTicketRow[]);
    const { data: reads } = await supportFrom(supabase, "support_message_reads")
      .select("ticket_id, last_read_at")
      .eq("user_id", userId);
    const readMap = new Map<string, string>(
      (reads ?? []).map((r: { ticket_id: string; last_read_at: string }) => [
        r.ticket_id,
        r.last_read_at,
      ]),
    );
    return tickets.map((row) => ({
      id: row.id,
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      status: row.status,
      waitingOn: row.waitingOn,
      category: row.category,
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      unread: (() => {
        const last = readMap.get(row.id);
        if (!last) return row.messageCount > 0;
        return new Date(row.lastMessageAt).getTime() > new Date(last).getTime();
      })(),
      requesterUserId: row.requesterUserId,
      surface: row.surface,
    }));
  } catch (err) {
    logServerError("support.loadSummaries", err);
    return [];
  }
}
