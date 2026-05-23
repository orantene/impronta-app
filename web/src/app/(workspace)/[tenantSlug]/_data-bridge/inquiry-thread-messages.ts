import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { INQUIRY_CLOSED_STATUSES } from "./inquiries-workspace";
import type { ThreadType, WorkspaceMessage } from "./inquiries-messages";

/**
 * Count total unread messages across all open inquiries for the current user.
 * Used by the workspace nav to show a badge on the Messages tab.
 * Returns 0 on any error (badge is non-critical).
 */
export async function loadTotalUnreadMessages(tenantId: string): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return 0;

    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;
    if (!myUserId) return 0;

    const { data: inquiryRows, error: inquiryErr } = await supabase
      .from("inquiries")
      .select("id")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`);

    if (inquiryErr || !inquiryRows?.length) return 0;
    const inquiryIds = inquiryRows.map((r: { id: string }) => r.id);
    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, thread_type, last_read_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", myUserId)
        .in("inquiry_id", inquiryIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, thread_type, sender_user_id, created_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .neq("sender_user_id", myUserId)
        .in("inquiry_id", inquiryIds),
    ]);

    if (messagesRes.error) {
      logServerError("workspace.loadTotalUnreadMessages", messagesRes.error);
      return 0;
    }

    const readAtMap = new Map<string, string>();
    for (const r of (readsRes.data ?? []) as {
      inquiry_id: string; thread_type: string; last_read_at: string | null;
    }[]) {
      if (r.last_read_at) readAtMap.set(`${r.inquiry_id}:${r.thread_type}`, r.last_read_at);
    }

    let total = 0;
    for (const m of (messagesRes.data ?? []) as {
      inquiry_id: string; thread_type: string; created_at: string;
    }[]) {
      const lastRead = readAtMap.get(`${m.inquiry_id}:${m.thread_type}`);
      if (!lastRead || new Date(m.created_at).getTime() > new Date(lastRead).getTime()) total += 1;
    }
    return total;
  } catch (err) {
    logServerError("workspace.loadTotalUnreadMessages", err);
    return 0;
  }
}

/**
 * Load messages for a specific inquiry thread (private or group).
 * Returns messages with sender display_name resolved.
 */
export async function loadInquiryMessages(
  tenantId: string,
  inquiryId: string,
  threadType: ThreadType,
): Promise<WorkspaceMessage[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;
    const { data, error } = await readClient
      .from("inquiry_messages")
      .select("id, sender_user_id, body, created_at, message_kind, card_payload, profiles:sender_user_id(display_name)")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", threadType)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      logServerError("workspace.loadInquiryMessages", error);
      return [];
    }

    type MsgRow = {
      id: string;
      sender_user_id: string | null;
      body: string;
      created_at: string;
      message_kind: string | null;
      card_payload: Record<string, unknown> | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const rows = (data ?? []) as unknown as MsgRow[];
    const messageIds = rows.map((r) => r.id);
    const reactionsByMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();
    if (messageIds.length > 0) {
      const { data: reactionRows } = await readClient
        .from("message_reactions")
        .select("message_id, emoji, user_id")
        .in("message_id", messageIds);
      for (const r of ((reactionRows ?? []) as Array<{ message_id: string; emoji: string; user_id: string }>)) {
        let perMsg = reactionsByMessage.get(r.message_id);
        if (!perMsg) {
          perMsg = new Map();
          reactionsByMessage.set(r.message_id, perMsg);
        }
        const entry = perMsg.get(r.emoji) ?? { count: 0, mine: false };
        entry.count += 1;
        if (myUserId && r.user_id === myUserId) entry.mine = true;
        perMsg.set(r.emoji, entry);
      }
    }

    let counterpartyLastRead: string | null = null;
    if (myUserId) {
      const { data: readsRows } = await readClient
        .from("inquiry_message_reads")
        .select("user_id, last_read_at")
        .eq("inquiry_id", inquiryId)
        .eq("thread_type", threadType)
        .neq("user_id", myUserId);
      for (const r of ((readsRows ?? []) as Array<{ user_id: string; last_read_at: string }>)) {
        if (!counterpartyLastRead || r.last_read_at > counterpartyLastRead) counterpartyLastRead = r.last_read_at;
      }
    }

    const starredSet = new Set<string>();
    if (myUserId && messageIds.length > 0) {
      const { data: starsRows } = await supabase
        .from("inquiry_message_stars")
        .select("message_id")
        .eq("user_id", myUserId)
        .in("message_id", messageIds);
      for (const r of ((starsRows ?? []) as Array<{ message_id: string }>)) starredSet.add(r.message_id);
    }

    return rows.map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const senderName =
        profile?.display_name?.trim()
        || (row.sender_user_id ? row.sender_user_id.slice(0, 8) : "System");
      const reactionAgg = reactionsByMessage.get(row.id);
      const is_mine = !!row.sender_user_id && row.sender_user_id === myUserId;
      return {
        id: row.id,
        sender_user_id: row.sender_user_id ?? "",
        sender_name: senderName,
        body: row.body,
        created_at: row.created_at,
        is_mine,
        message_kind: row.message_kind ?? "text",
        card_payload: row.card_payload ?? null,
        reactions: reactionAgg
          ? [...reactionAgg.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
          : [],
        seen_at: is_mine && counterpartyLastRead && counterpartyLastRead >= row.created_at ? counterpartyLastRead : null,
        starred: starredSet.has(row.id),
      };
    });
  } catch (err) {
    logServerError("workspace.loadInquiryMessages", err);
    return [];
  }
}
