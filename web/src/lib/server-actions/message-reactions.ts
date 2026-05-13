"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

type ReactionResult = { ok: true } | { ok: false; error: string };

export async function addReaction(
  messageId: string,
  emoji: string,
): Promise<ReactionResult> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const { error } = await supabase.from("message_reactions").insert({
      message_id: messageId,
      user_id: session.user.id,
      emoji,
    });

    if (error) {
      logServerError("message-reactions.add", error);
      return { ok: false, error: "Failed to add reaction." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("message-reactions.add", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function removeReaction(
  messageId: string,
  emoji: string,
): Promise<ReactionResult> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", session.user.id)
      .eq("emoji", emoji);

    if (error) {
      logServerError("message-reactions.remove", error);
      return { ok: false, error: "Failed to remove reaction." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("message-reactions.remove", err);
    return { ok: false, error: "Unexpected error." };
  }
}
