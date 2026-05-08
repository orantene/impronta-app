"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

// ─── Upload and immediately register under a talent ───────────────────────────

export type RegisterMediaResult = ActionResult<{ id: string; publicUrl: string }>;

export async function actionUploadAndAssignMedia(
  formData: FormData,
  talentProfileId: string,
): Promise<RegisterMediaResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file provided." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Images only." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "File must be under 25 MB." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${talentProfileId}/gallery/${randomUUID()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("media-public")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (upErr) {
    logServerError("media.actions.uploadAssign.storage", upErr);
    return { ok: false, error: "Upload failed. Try again." };
  }

  const { data: maxRow } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const { data: inserted, error: insErr } = await admin
    .from("media_assets")
    .insert({
      tenant_id: tenantId,
      owner_talent_profile_id: talentProfileId,
      bucket_id: "media-public",
      storage_path: storagePath,
      variant_kind: "gallery",
      approval_state: "approved",
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("media.actions.uploadAssign.insert", insErr);
    void admin.storage.from("media-public").remove([storagePath]);
    return { ok: false, error: "Could not save. Try again." };
  }

  const { data: urlData } = admin.storage.from("media-public").getPublicUrl(storagePath);

  revalidatePath("/", "layout");
  return { ok: true, data: { id: (inserted as { id: string }).id, publicUrl: urlData.publicUrl } };
}

// ─── Assign existing storage path to a talent (bulk upload flow) ─────────────

export async function actionAssignMediaToTalent(
  storagePaths: string[],
  talentProfileId: string,
): Promise<ActionResult<{ count: number }>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { data: maxRow } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const rows = storagePaths.map((sp) => ({
    tenant_id: tenantId,
    owner_talent_profile_id: talentProfileId,
    bucket_id: "media-public",
    storage_path: sp,
    variant_kind: "gallery" as const,
    approval_state: "approved" as const,
    sort_order: nextOrder++,
  }));

  const { error } = await admin.from("media_assets").insert(rows);
  if (error) {
    logServerError("media.actions.assignToTalent", error);
    return { ok: false, error: "Could not assign. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { count: storagePaths.length } };
}

// ─── Soft-delete one or many media assets ────────────────────────────────────

export async function actionDeleteMediaAssets(
  ids: string[],
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const now = new Date().toISOString();
  const { error, count } = await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media.actions.delete", error);
    return { ok: false, error: "Delete failed. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { count: count ?? ids.length } };
}

// ─── Approve / reject media assets ───────────────────────────────────────────

export async function actionSetApprovalState(
  ids: string[],
  state: "approved" | "rejected",
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error, count } = await admin
    .from("media_assets")
    .update({ approval_state: state, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media.actions.approval", error);
    return { ok: false, error: "Could not update. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { count: count ?? ids.length } };
}

// ─── Re-assign photos to a different talent ───────────────────────────────────

export async function actionReassignMediaToTalent(
  ids: string[],
  talentProfileId: string,
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: true, data: { count: 0 } };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRow } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent not on this roster." };

  const { error, count } = await admin
    .from("media_assets")
    .update({ owner_talent_profile_id: talentProfileId, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media.actions.reassign", error);
    return { ok: false, error: "Could not reassign. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { count: count ?? ids.length } };
}

// ─── Update per-image watermark override ─────────────────────────────────────

export async function actionSetMediaWatermarkOverride(
  id: string,
  override: Record<string, unknown> | null,
): Promise<ActionResult<null>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { error } = await admin
    .from("media_assets")
    .update({ watermark_override_json: override, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("media.actions.watermarkOverride", error);
    return { ok: false, error: "Could not update. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

// ─── Load roster talent list for assign/reassign dropdown ────────────────────

export type RosterTalentOption = { id: string; name: string; thumbUrl: string | null };

export async function actionLoadRosterTalents(): Promise<ActionResult<RosterTalentOption[]>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("agency_talent_roster")
    .select(`
      talent_profiles!talent_profile_id (
        id,
        display_name,
        first_name,
        last_name
      )
    `)
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    logServerError("media.actions.loadRosterTalents", error);
    return { ok: false, error: "Could not load roster." };
  }

  type TalentProfileJoin = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  type RosterTalentJoin = {
    talent_profiles: TalentProfileJoin | TalentProfileJoin[] | null;
  };

  const talents: RosterTalentOption[] = ((data ?? []) as unknown as RosterTalentJoin[])
    .map((r) =>
      Array.isArray(r.talent_profiles) ? (r.talent_profiles[0] ?? null) : r.talent_profiles,
    )
    .filter((profile): profile is TalentProfileJoin => Boolean(profile))
    .map((p) => ({
      id: p.id,
      name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed",
      thumbUrl: null,
    }));

  return { ok: true, data: talents };
}
