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

/**
 * F.10 — Update an existing availability block. Talent-self only;
 * RLS enforces the (talent_profile.user_id == auth.uid()) check.
 */
export type UpdateBlockInput = {
  blockId: string;
  reason?: string;
  note?: string | null;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  visibility?: "private" | "agency_visible";
};

export async function updateTalentAvailabilityBlock(
  input: UpdateBlockInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const patch: Record<string, unknown> = {};
    if (input.reason !== undefined) {
      const reason = input.reason.trim();
      if (!reason) return { ok: false, error: "Reason can't be empty." };
      patch.reason = reason;
    }
    if (input.note !== undefined) patch.note = input.note?.trim() || null;
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
    if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
    if (input.allDay !== undefined) patch.all_day = input.allDay;
    if (input.visibility !== undefined) patch.visibility = input.visibility;

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: "No fields to update." };
    }

    // Range validation when both ends present.
    if (typeof patch.starts_at === "string" && typeof patch.ends_at === "string") {
      if (new Date(patch.ends_at as string).getTime() <= new Date(patch.starts_at as string).getTime()) {
        return { ok: false, error: "End must be after start." };
      }
    }

    const { error } = await supabase
      .from("talent_availability_blocks")
      .update(patch)
      .eq("id", input.blockId);

    if (error) {
      logServerError("talent-calendar.updateBlock", error);
      return { ok: false, error: "Couldn't update — try again." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("talent-calendar.updateBlock", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * F.10 — List a talent's availability blocks in a date window.
 * Powers the schedule editor UI ("here's everything you've blocked off").
 * Defaults to a 6-month forward window.
 */
export type AvailabilityBlock = {
  id: string;
  reason: string;
  note: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  visibility: "private" | "agency_visible";
  createdAt: string;
};

export async function listTalentAvailabilityBlocks(opts?: {
  talentProfileId?: string;
  fromIso?: string;
  toIso?: string;
}): Promise<AvailabilityBlock[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const now = Date.now();
    const fromIso = opts?.fromIso ?? new Date(now - 14 * 86_400_000).toISOString();
    const toIso = opts?.toIso ?? new Date(now + 180 * 86_400_000).toISOString();

    let query = supabase
      .from("talent_availability_blocks")
      .select("id, reason, note, starts_at, ends_at, all_day, visibility, created_at")
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
      .order("starts_at", { ascending: true });

    if (opts?.talentProfileId) {
      query = query.eq("talent_profile_id", opts.talentProfileId);
    }

    const { data, error } = await query;
    if (error) {
      logServerError("talent-calendar.listBlocks", error);
      return [];
    }

    return (data ?? []).map((row) => {
      const r = row as {
        id: string;
        reason: string;
        note: string | null;
        starts_at: string;
        ends_at: string;
        all_day: boolean;
        visibility: "private" | "agency_visible";
        created_at: string;
      };
      return {
        id: r.id,
        reason: r.reason,
        note: r.note,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        allDay: r.all_day,
        visibility: r.visibility,
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    logServerError("talent-calendar.listBlocks", err);
    return [];
  }
}

/**
 * F.10 — Bulk save: replace the talent's entire set of blocks within a
 * specific date window with the provided list. Used by the schedule
 * editor's "Save schedule" button when the user has been adding /
 * removing blocks in a single editing session. Atomic via deletes
 * inside the window followed by inserts of the new state.
 */
export async function bulkSaveTalentAvailabilityBlocks(input: {
  talentProfileId: string;
  windowStartIso: string;
  windowEndIso: string;
  blocks: Array<{
    reason: string;
    note?: string | null;
    startsAt: string;
    endsAt: string;
    allDay?: boolean;
    visibility?: "private" | "agency_visible";
  }>;
}): Promise<{ ok: true; replaced: number } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    // Delete the existing window first (RLS scopes to self).
    const { error: deleteErr } = await supabase
      .from("talent_availability_blocks")
      .delete()
      .eq("talent_profile_id", input.talentProfileId)
      .gte("starts_at", input.windowStartIso)
      .lt("starts_at", input.windowEndIso);
    if (deleteErr) {
      logServerError("talent-calendar.bulkSave.delete", deleteErr);
      return { ok: false, error: "Couldn't clear existing schedule." };
    }

    if (input.blocks.length === 0) {
      revalidatePath("/", "layout");
      return { ok: true, replaced: 0 };
    }

    const rows = input.blocks.map((b) => ({
      talent_profile_id: input.talentProfileId,
      reason: b.reason.trim() || "unavailable",
      note: b.note?.trim() || null,
      starts_at: b.startsAt,
      ends_at: b.endsAt,
      all_day: b.allDay ?? true,
      visibility: b.visibility ?? "agency_visible",
    }));

    const { error: insertErr } = await supabase
      .from("talent_availability_blocks")
      .insert(rows);
    if (insertErr) {
      logServerError("talent-calendar.bulkSave.insert", insertErr);
      return { ok: false, error: "Couldn't save new schedule." };
    }

    revalidatePath("/", "layout");
    return { ok: true, replaced: rows.length };
  } catch (err) {
    logServerError("talent-calendar.bulkSave", err);
    return { ok: false, error: "Unexpected error." };
  }
}
