"use server";

/**
 * message-stars — per-user message star (private bookmark).
 *
 * Distinct from reactions (which everyone sees) and inquiry-level
 * pinning. A star is a personal flag — only the user who set it can
 * see it. Used to mark "I want to find this later" on individual
 * messages.
 *
 * Table: inquiry_message_stars (PK user_id + message_id). RLS enforces
 * user_id = auth.uid() on every operation.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

type StarResult = { ok: true; starred: boolean } | { ok: false; error: string };

/**
 * Toggle a star on a message. Returns the new state (true = starred,
 * false = unstarred). Idempotent — calling twice toggles back.
 */
export async function toggleMessageStar(
  messageId: string,
  inquiryId: string,
): Promise<StarResult> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    // Check current state.
    const { data: existing, error: readErr } = await supabase
      .from("inquiry_message_stars")
      .select("message_id")
      .eq("user_id", session.user.id)
      .eq("message_id", messageId)
      .maybeSingle();

    if (readErr) {
      logServerError("message-stars.read", readErr);
      return { ok: false, error: "Failed to read star state." };
    }

    if (existing) {
      // Unstar.
      const { error } = await supabase
        .from("inquiry_message_stars")
        .delete()
        .eq("user_id", session.user.id)
        .eq("message_id", messageId);
      if (error) {
        logServerError("message-stars.unstar", error);
        return { ok: false, error: "Failed to unstar." };
      }
      revalidatePath("/", "layout");
      return { ok: true, starred: false };
    }

    // Star.
    const { error } = await supabase.from("inquiry_message_stars").insert({
      user_id: session.user.id,
      message_id: messageId,
      inquiry_id: inquiryId,
    });
    if (error) {
      logServerError("message-stars.star", error);
      return { ok: false, error: "Failed to star." };
    }
    revalidatePath("/", "layout");
    return { ok: true, starred: true };
  } catch (err) {
    logServerError("message-stars.toggle", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Load the set of message_ids the caller has starred on this inquiry.
 * Returns an empty set on error or no auth.
 */
export async function loadMyStarredMessageIds(
  inquiryId: string,
): Promise<Set<string>> {
  const empty = new Set<string>();
  try {
    const session = await getCachedActorSession();
    if (!session?.user) return empty;

    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const { data, error } = await supabase
      .from("inquiry_message_stars")
      .select("message_id")
      .eq("user_id", session.user.id)
      .eq("inquiry_id", inquiryId);

    if (error) {
      logServerError("message-stars.load", error);
      return empty;
    }

    const out = new Set<string>();
    for (const r of (data ?? []) as Array<{ message_id: string }>) {
      out.add(r.message_id);
    }
    return out;
  } catch (err) {
    logServerError("message-stars.load", err);
    return empty;
  }
}
