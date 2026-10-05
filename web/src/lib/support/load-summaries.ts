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
    // Resolve who opened the tickets that are not the reader's own.
    //
    // The panel used to answer "whose ticket is this?" with a Mine/Workspace
    // tab, which makes the reader change mode to learn a fact that belongs on
    // the row. One query for the distinct other requesters; skipped entirely
    // when every ticket is the reader's own, which is the common case.
    const otherIds = [
      ...new Set(
        tickets
          .map((r) => r.requesterUserId)
          .filter((id): id is string => Boolean(id) && id !== userId),
      ),
    ];
    const nameMap = new Map<string, string>();
    if (otherIds.length > 0) {
      const { data: people, error: peopleError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", otherIds);
      // A failed lookup must not cost the reader their ticket list: the rows
      // still render, just without an attribution.
      if (peopleError) logServerError("support.loadSummaries.names", peopleError);
      // `display_name`, not `full_name`: profiles has no full_name column, and
      // the query would have failed silently — logged, no names, a feature that
      // looks implemented and does nothing. load-hq.ts already reads this one.
      for (const p of (people ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name?.trim()) nameMap.set(p.id, p.display_name.trim());
      }
    }

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
      requesterName:
        row.requesterUserId && row.requesterUserId !== userId
          ? (nameMap.get(row.requesterUserId) ?? null)
          : null,
      surface: row.surface,
    }));
  } catch (err) {
    logServerError("support.loadSummaries", err);
    return [];
  }
}
