"use server";

/**
 * Platform-admin notes CRUD.
 *
 * These run with the service-role client and are gated on super_admin.
 * Notes are stored in user_admin_notes and can be attached to either
 * a human profile (target_user_id) or an unclaimed talent profile
 * (target_talent_profile_id).
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };
  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") return { ok: false, error: "Forbidden." };
  return { ok: true, userId: session.user.id };
}

export type AdminNote = {
  id: string;
  body: string;
  authorUserId: string;
  authorDisplayName: string | null;
  createdAt: string;
};

/**
 * Get all admin notes for a user or unclaimed talent profile.
 *
 * For `human`: queries notes where target_user_id matches.
 * For `unclaimed_talent`: queries notes where target_talent_profile_id matches.
 *
 * Returns empty array on auth failure or DB error.
 */
export async function getPlatformUserNotes(
  targetId: string,
  targetKind: "human" | "unclaimed_talent",
): Promise<AdminNote[]> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return [];

  if (!targetId?.trim()) return [];

  const admin = createServiceRoleClient();
  if (!admin) return [];

  try {
    const column = targetKind === "human" ? "target_user_id" : "target_talent_profile_id";
    const { data: notes, error } = await admin
      .from("user_admin_notes")
      .select(
        `
        id,
        body,
        author_user_id,
        created_at,
        profiles!inner(display_name)
        `,
      )
      .eq(column, targetId)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("platform/getPlatformUserNotes", error);
      return [];
    }

    return (notes ?? []).map(
      (note: {
        id: string;
        body: string;
        author_user_id: string;
        created_at: string;
        profiles: { display_name: string | null } | null;
      }) => ({
        id: note.id,
        body: note.body,
        authorUserId: note.author_user_id,
        authorDisplayName: note.profiles?.display_name ?? null,
        createdAt: note.created_at,
      }),
    );
  } catch (err) {
    logServerError("platform/getPlatformUserNotes", err);
    return [];
  }
}

/**
 * Add a new admin note to a user or unclaimed talent profile.
 *
 * For `human`: creates note with target_user_id, target_talent_profile_id = null.
 * For `unclaimed_talent`: creates note with target_talent_profile_id, target_user_id = null.
 */
export async function addPlatformUserNote(
  targetId: string,
  targetKind: "human" | "unclaimed_talent",
  body: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!targetId?.trim()) return { ok: false, error: "Missing target ID." };
  if (!body?.trim()) return { ok: false, error: "Note body cannot be empty." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  try {
    const targetUserIdValue = targetKind === "human" ? targetId : null;
    const targetTalentProfileIdValue = targetKind === "unclaimed_talent" ? targetId : null;

    const { error } = await admin.from("user_admin_notes").insert({
      target_user_id: targetUserIdValue,
      target_talent_profile_id: targetTalentProfileIdValue,
      body: body.trim(),
      author_user_id: auth.userId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      logServerError("platform/addPlatformUserNote", error);
      return { ok: false, error: error.message ?? "Failed to add note." };
    }

    revalidatePath("/platform/admin/users");
    return { ok: true };
  } catch (err) {
    logServerError("platform/addPlatformUserNote", err);
    return { ok: false, error: "Failed to add note." };
  }
}

/**
 * Delete an admin note by ID.
 *
 * Any super_admin may delete any note.
 */
export async function deletePlatformUserNote(noteId: string): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!noteId?.trim()) return { ok: false, error: "Missing note ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  try {
    const { error } = await admin.from("user_admin_notes").delete().eq("id", noteId);

    if (error) {
      logServerError("platform/deletePlatformUserNote", error);
      return { ok: false, error: error.message ?? "Failed to delete note." };
    }

    revalidatePath("/platform/admin/users");
    return { ok: true };
  } catch (err) {
    logServerError("platform/deletePlatformUserNote", err);
    return { ok: false, error: "Failed to delete note." };
  }
}
