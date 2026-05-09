"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export type MediaFolder = {
  id: string;
  name: string;
  color: string | null;
  isPrivate: boolean;
  shareToken: string | null;
  shareExpiresAt: string | null;
  shareViewCount: number;
  createdAt: string;
  itemCount?: number;
};

// ─── List folders for workspace ────────────────────────────────────────────────

export async function actionListMediaFolders(): Promise<ActionResult<MediaFolder[]>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("media_folders")
    .select("id, name, color, is_private, share_token, share_expires_at, share_view_count, created_at")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    logServerError("folder.list", error);
    return { ok: false, error: "Could not load folders." };
  }

  type Row = {
    id: string; name: string; color: string | null;
    is_private: boolean; share_token: string | null;
    share_expires_at: string | null; share_view_count: number;
    created_at: string;
  };

  return {
    ok: true,
    data: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      isPrivate: r.is_private,
      shareToken: r.share_token,
      shareExpiresAt: r.share_expires_at,
      shareViewCount: r.share_view_count,
      createdAt: r.created_at,
    })),
  };
}

// ─── Create folder ─────────────────────────────────────────────────────────────

export async function actionCreateMediaFolder(
  name: string,
  color?: string,
  isPrivate = false,
): Promise<ActionResult<MediaFolder>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Folder name is required." };
  if (trimmed.length > 80) return { ok: false, error: "Folder name too long (max 80 chars)." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("media_folders")
    .insert({
      tenant_id: auth.tenantId,
      name: trimmed,
      color: color ?? null,
      is_private: isPrivate,
      created_by: auth.user.id,
    })
    .select("id, name, color, is_private, share_token, share_expires_at, share_view_count, created_at")
    .single();

  if (error || !data) {
    logServerError("folder.create", error);
    return { ok: false, error: "Could not create folder." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");

  type Row = typeof data & { is_private: boolean; share_token: string | null; share_expires_at: string | null; share_view_count: number };
  const r = data as unknown as Row;
  return {
    ok: true,
    data: {
      id: r.id, name: r.name, color: r.color, isPrivate: r.is_private,
      shareToken: r.share_token, shareExpiresAt: r.share_expires_at,
      shareViewCount: r.share_view_count, createdAt: r.created_at,
    },
  };
}

// ─── Rename folder ─────────────────────────────────────────────────────────────

export async function actionRenameMediaFolder(
  folderId: string,
  name: string,
  color?: string,
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Folder name is required." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const patch: Record<string, unknown> = { name: trimmed, updated_at: new Date().toISOString() };
  if (color !== undefined) patch.color = color;

  const { error } = await admin
    .from("media_folders")
    .update(patch)
    .eq("id", folderId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    logServerError("folder.rename", error);
    return { ok: false, error: "Could not rename folder." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}

// ─── Delete folder ─────────────────────────────────────────────────────────────
// Deletes the folder record. Items (media_folder_items rows) cascade-delete.
// The media_assets themselves are NOT deleted.

export async function actionDeleteMediaFolder(folderId: string): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("media_folders")
    .delete()
    .eq("id", folderId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    logServerError("folder.delete", error);
    return { ok: false, error: "Could not delete folder." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}

// ─── Add assets to folder ──────────────────────────────────────────────────────

export async function actionAddAssetsToFolder(
  folderId: string,
  assetIds: string[],
): Promise<ActionResult<{ count: number }>> {
  if (assetIds.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Verify the folder belongs to this tenant
  const { data: folder } = await admin
    .from("media_folders")
    .select("id")
    .eq("id", folderId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!folder) return { ok: false, error: "Folder not found." };

  const rows = assetIds.map((assetId) => ({
    folder_id: folderId,
    asset_id: assetId,
    added_by: auth.user.id,
  }));

  // ON CONFLICT DO NOTHING — idempotent
  const { error, count } = await admin
    .from("media_folder_items")
    .upsert(rows, { onConflict: "folder_id,asset_id", ignoreDuplicates: true });

  if (error) {
    logServerError("folder.addAssets", error);
    return { ok: false, error: "Could not add to folder." };
  }

  await logActivity(auth.tenantId, assetIds, "moved_to_folder", { folderId });
  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: { count: count ?? assetIds.length } };
}

// ─── Remove assets from folder ─────────────────────────────────────────────────

export async function actionRemoveAssetsFromFolder(
  folderId: string,
  assetIds: string[],
): Promise<ActionResult<null>> {
  if (assetIds.length === 0) return { ok: true, data: null };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("media_folder_items")
    .delete()
    .eq("folder_id", folderId)
    .in("asset_id", assetIds);

  if (error) {
    logServerError("folder.removeAssets", error);
    return { ok: false, error: "Could not remove from folder." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}

// ─── List assets in a folder ───────────────────────────────────────────────────

export async function actionListFolderAssets(
  folderId: string,
): Promise<ActionResult<string[]>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("media_folder_items")
    .select("asset_id")
    .eq("folder_id", folderId);

  if (error) {
    logServerError("folder.listAssets", error);
    return { ok: false, error: "Could not load folder contents." };
  }

  return { ok: true, data: (data ?? []).map((r) => (r as { asset_id: string }).asset_id) };
}

// ─── Create / revoke share link ────────────────────────────────────────────────

export async function actionCreateFolderShareLink(
  folderId: string,
  expiryDays?: number,
): Promise<ActionResult<{ shareUrl: string; token: string }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const token = randomUUID();
  const expiresAt = expiryDays
    ? new Date(Date.now() + expiryDays * 86_400_000).toISOString()
    : null;

  const { error } = await admin
    .from("media_folders")
    .update({ share_token: token, share_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", folderId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    logServerError("folder.shareLink", error);
    return { ok: false, error: "Could not create share link." };
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/share/folder/${token}`;
  return { ok: true, data: { shareUrl, token } };
}

export async function actionRevokeFolderShareLink(folderId: string): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("media_folders")
    .update({ share_token: null, share_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", folderId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    logServerError("folder.revokeLink", error);
    return { ok: false, error: "Could not revoke share link." };
  }

  return { ok: true, data: null };
}

// ─── Tags ──────────────────────────────────────────────────────────────────────

export async function actionSetAssetTags(
  assetId: string,
  tags: string[],
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("media_assets")
    .update({ tags: clean, updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    logServerError("tags.set", error);
    return { ok: false, error: "Could not update tags." };
  }

  await logActivity(auth.tenantId, [assetId], "tagged", { tags: clean });
  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}

export async function actionGetWorkspaceTags(): Promise<ActionResult<string[]>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Unnest all tags across the workspace's media_assets for autocomplete
  const { data, error } = await admin.rpc("get_workspace_media_tags", {
    p_tenant_id: auth.tenantId,
  });

  if (error) {
    // RPC might not exist yet — fall back to empty (non-fatal)
    return { ok: true, data: [] };
  }

  return { ok: true, data: (data as string[] | null) ?? [] };
}

// ─── Activity log helpers ──────────────────────────────────────────────────────

async function logActivity(
  tenantId: string,
  assetIds: string[],
  kind: string,
  payload?: Record<string, unknown>,
) {
  try {
    const admin = createServiceRoleClient();
    if (!admin || assetIds.length === 0) return;
    const rows = assetIds.map((assetId) => ({
      asset_id: assetId,
      tenant_id: tenantId,
      kind,
      payload: payload ?? null,
    }));
    await admin.from("media_asset_activity").insert(rows);
  } catch {
    // Activity log is non-critical — never throw
  }
}

export async function actionGetAssetActivity(
  assetId: string,
  limit = 20,
): Promise<ActionResult<Array<{ id: string; kind: string; payload: unknown; createdAt: string }>>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("media_asset_activity")
    .select("id, kind, payload, created_at")
    .eq("asset_id", assetId)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logServerError("activity.get", error);
    return { ok: false, error: "Could not load activity." };
  }

  type Row = { id: string; kind: string; payload: unknown; created_at: string };
  return {
    ok: true,
    data: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id, kind: r.kind, payload: r.payload, createdAt: r.created_at,
    })),
  };
}

// ─── Asset notes ──────────────────────────────────────────────────────────────

export async function actionSetAssetNote(
  assetId: string,
  note: string,
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Store note in metadata.note — avoids a new column for a lightweight field
  const { data: existing } = await admin
    .from("media_assets")
    .select("metadata")
    .eq("id", assetId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  const currentMeta = (existing as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {};
  const newMeta = { ...currentMeta, note: note.trim() || null };

  const { error } = await admin
    .from("media_assets")
    .update({ metadata: newMeta, updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    logServerError("asset.note", error);
    return { ok: false, error: "Could not save note." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: null };
}
