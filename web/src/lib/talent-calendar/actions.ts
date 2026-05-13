"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

/**
 * Talent-side calendar write actions (B.3).
 *
 * Talents can author availability_blocks (OOO, personal time). Bookings and
 * holds are written by the inquiry-engine when offers / bookings happen —
 * those write paths land alongside the booking conversion flow.
 */

export type CreateBlockInput = {
  talentProfileId: string;
  reason: string;
  note?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  visibility?: "private" | "agency_visible";
};

export async function createTalentAvailabilityBlock(
  input: CreateBlockInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    if (!input.talentProfileId) return { ok: false, error: "Missing talent profile." };
    if (!input.reason.trim()) return { ok: false, error: "Reason is required." };
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      return { ok: false, error: "End must be after start." };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const { data, error } = await supabase
      .from("talent_availability_blocks")
      .insert({
        talent_profile_id: input.talentProfileId,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        all_day: input.allDay ?? true,
        visibility: input.visibility ?? "agency_visible",
      })
      .select("id")
      .single();

    if (error || !data) {
      logServerError("talent-calendar.createBlock", error);
      return { ok: false, error: "Could not save block — try again." };
    }

    revalidatePath("/", "layout");
    return { ok: true, id: data.id as string };
  } catch (err) {
    logServerError("talent-calendar.createBlock", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function deleteTalentAvailabilityBlock(
  blockId: string,
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false };

    const { error } = await supabase
      .from("talent_availability_blocks")
      .delete()
      .eq("id", blockId);

    if (error) {
      logServerError("talent-calendar.deleteBlock", error);
      return { ok: false };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("talent-calendar.deleteBlock", err);
    return { ok: false };
  }
}
