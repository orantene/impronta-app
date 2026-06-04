"use server";

/**
 * message-pins — INQUIRY-WIDE shared message pins.
 *
 * Distinct from inquiry_message_stars (per-user private bookmark). A pin is
 * shared across the whole inquiry thread: when anyone pins a message, EVERYONE
 * on the thread sees it in the "Pinned" strip. Table inquiry_message_pins has
 * PK(message_id) — a message is pinned once for everyone. RLS gates pin/unpin to
 * tenant staff OR an inquiry participant.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

type PinToggleResult =
  | { ok: true; pinned: boolean }
  | { ok: false; error: string };

type MessageRow = { id: string; tenant_id: string; inquiry_id: string };

/**
 * Toggle the shared pin on a message. Returns the new shared state
 * (true = pinned, false = unpinned). Authorization is enforced by RLS on
 * inquiry_message_pins (staff of the tenant OR an inquiry participant).
 */
export async function toggleMessagePin(
  messageId: string,
  inquiryId: string,
): Promise<PinToggleResult> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    // Current shared state.
    const { data: existing, error: readErr } = await supabase
      .from("inquiry_message_pins")
      .select("message_id")
      .eq("message_id", messageId)
      .maybeSingle()
      .returns<{ message_id: string }>();

    if (readErr) {
      logServerError("message-pins.read", readErr);
      return { ok: false, error: "Failed to read pin state." };
    }

    if (existing) {
      const { error } = await supabase
        .from("inquiry_message_pins")
        .delete()
        .eq("message_id", messageId);
      if (error) {
        logServerError("message-pins.unpin", error);
        return { ok: false, error: "Failed to unpin." };
      }
      revalidatePath("/", "layout");
      return { ok: true, pinned: false };
    }

    // Resolve tenant_id (and verify the inquiry) from the message itself — the
    // pins table requires tenant_id NOT NULL and we don't trust the client arg.
    const { data: msg, error: msgErr } = await supabase
      .from("inquiry_messages")
      .select("id, tenant_id, inquiry_id")
      .eq("id", messageId)
      .maybeSingle()
      .returns<MessageRow>();

    if (msgErr) {
      logServerError("message-pins.message-read", msgErr);
      return { ok: false, error: "Failed to load message." };
    }
    if (!msg || (inquiryId && msg.inquiry_id !== inquiryId)) {
      return { ok: false, error: "Message not found." };
    }

    const { error } = await supabase.from("inquiry_message_pins").insert({
      message_id: messageId,
      inquiry_id: msg.inquiry_id,
      tenant_id: msg.tenant_id,
      pinned_by: session.user.id,
    });
    if (error) {
      logServerError("message-pins.pin", error);
      return { ok: false, error: "Failed to pin." };
    }
    revalidatePath("/", "layout");
    return { ok: true, pinned: true };
  } catch (err) {
    logServerError("message-pins.toggle", err);
    return { ok: false, error: "Unexpected error." };
  }
}
