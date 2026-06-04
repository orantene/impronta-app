import "server-only";

/**
 * load-pins — read the inquiry-wide pinned messages for a thread.
 *
 * Plain server module (NOT "use server") so Server Components can import it
 * directly. Returns newest-pinned first, excludes deleted messages, and joins
 * the sender + pinned-by display names. RLS on inquiry_message_pins scopes rows
 * to staff/participants automatically. Returns [] on any error.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import type { PinnedMessage } from "@/lib/messages/pin-types";

type PinRow = { message_id: string; pinned_by: string | null; pinned_at: string };
type MsgRow = {
  id: string;
  body: string | null;
  sender_user_id: string | null;
  thread_type: "private" | "group";
  created_at: string;
  deleted_at: string | null;
};

export async function loadPinnedMessages(
  inquiryId: string,
  threadType?: "private" | "group",
): Promise<PinnedMessage[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: pinRows, error: pinErr } = await supabase
      .from("inquiry_message_pins")
      .select("message_id, pinned_by, pinned_at")
      .eq("inquiry_id", inquiryId)
      .order("pinned_at", { ascending: false })
      .returns<PinRow[]>();

    if (pinErr) {
      logServerError("load-pins.pins", pinErr);
      return [];
    }
    const pins = pinRows ?? [];
    if (pins.length === 0) return [];

    const messageIds = pins.map((p) => p.message_id);
    const { data: msgRows, error: msgErr } = await supabase
      .from("inquiry_messages")
      .select("id, body, sender_user_id, thread_type, created_at, deleted_at")
      .in("id", messageIds)
      .returns<MsgRow[]>();

    if (msgErr) {
      logServerError("load-pins.messages", msgErr);
      return [];
    }
    const msgById = new Map<string, MsgRow>();
    for (const m of msgRows ?? []) msgById.set(m.id, m);

    // Resolve display names for senders + pinners in one lookup.
    const userIds = new Set<string>();
    for (const p of pins) if (p.pinned_by) userIds.add(p.pinned_by);
    for (const m of msgRows ?? []) if (m.sender_user_id) userIds.add(m.sender_user_id);

    const nameById = new Map<string, string | null>();
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", [...userIds])
        .returns<Array<{ id: string; display_name: string | null }>>();
      for (const pr of profs ?? []) nameById.set(pr.id, pr.display_name);
    }

    const out: PinnedMessage[] = [];
    for (const p of pins) {
      const m = msgById.get(p.message_id);
      if (!m || m.deleted_at) continue;
      if (threadType && m.thread_type !== threadType) continue;
      out.push({
        messageId: p.message_id,
        inquiryId,
        body: m.body ?? "",
        senderUserId: m.sender_user_id,
        senderName: m.sender_user_id ? (nameById.get(m.sender_user_id) ?? null) : null,
        threadType: m.thread_type,
        pinnedByName: p.pinned_by ? (nameById.get(p.pinned_by) ?? null) : null,
        pinnedAt: p.pinned_at,
        createdAt: m.created_at,
      });
    }
    return out;
  } catch (err) {
    logServerError("load-pins.load", err);
    return [];
  }
}
