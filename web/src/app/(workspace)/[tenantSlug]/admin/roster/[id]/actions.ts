"use server";

/**
 * Canonical workspace roster — talent profile edit actions.
 *
 * Auth pattern: getCachedActorSession + getTenantScopeBySlug + userHasCapability.
 * Security boundary: talent must be on this tenant's roster (checked before any write).
 *
 * Handles:
 *  - updateRosterTalentProfile — core profile fields + workflow/visibility + roster row
 *  - updateRosterTalentWorkflow — quick sidebar approve/hide
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RosterTalentEditState =
  | { error: string; success?: never }
  | { success: true; error?: never }
  | undefined;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trim(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const editSchema = z.object({
  display_name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Display name is required.")),
  first_name: z.string().optional().transform((v) => v?.trim() ?? ""),
  last_name: z.string().optional().transform((v) => v?.trim() ?? ""),
  short_bio: z.string().optional().transform((v) => v?.trim() ?? ""),
  phone: z.string().optional().transform((v) => v?.trim() ?? ""),
  workflow_status: z
    .enum(["draft", "invited", "approved", "published", "hidden"])
    .optional(),
  visibility: z
    .enum(["hidden", "public", "private"])
    .optional(),
  agency_visibility: z
    .enum(["roster_only", "site_visible", "featured"])
    .optional(),
  talent_type_term_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// ─── Guard: resolve scope, check capability, verify roster membership ─────────

async function resolveEditContext(tenantSlug: string, talentId: string) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { ok: false as const, error: "You don't have permission to edit talent." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Server configuration error." };

  // Security: confirm this talent is actually on this tenant's roster.
  const { data: rosterRow, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("id, status, agency_visibility")
    .eq("tenant_id", scope.tenantId)
    .eq("talent_profile_id", talentId)
    .neq("status", "removed")
    .maybeSingle();

  if (rosterErr) {
    logServerError("roster/[id].resolveEditContext/rosterCheck", rosterErr);
    return { ok: false as const, error: "Could not verify roster membership." };
  }
  if (!rosterRow) return { ok: false as const, error: "Talent is not on your roster." };

  return {
    ok: true as const,
    admin,
    tenantId: scope.tenantId,
    userId: session.user.id,
    rosterRowId: (rosterRow as { id: string }).id,
    currentAgencyVisibility: (rosterRow as { agency_visibility: string }).agency_visibility,
  };
}

// ─── Update core profile fields ───────────────────────────────────────────────

export async function updateRosterTalentProfile(
  tenantSlug: string,
  talentId: string,
  _prev: RosterTalentEditState,
  formData: FormData,
): Promise<RosterTalentEditState> {
  const ctx = await resolveEditContext(tenantSlug, talentId);
  if (!ctx.ok) return { error: ctx.error };

  const raw = editSchema.safeParse({
    display_name: trim(formData.get("display_name")),
    first_name: trim(formData.get("first_name")),
    last_name: trim(formData.get("last_name")),
    short_bio: trim(formData.get("short_bio")),
    phone: trim(formData.get("phone")),
    workflow_status: trim(formData.get("workflow_status")) || undefined,
    visibility: trim(formData.get("visibility")) || undefined,
    agency_visibility: trim(formData.get("agency_visibility")) || undefined,
    talent_type_term_id: trim(formData.get("talent_type_term_id")) || undefined,
  });

  if (!raw.success) {
    return { error: raw.error.issues[0]?.message ?? "Validation failed." };
  }

  const d = raw.data;
  const { admin, tenantId, userId, rosterRowId } = ctx;

  // ── Load before state for workflow audit ───────────────────────────────────
  const { data: before, error: beforeErr } = await admin
    .from("talent_profiles")
    .select("workflow_status, visibility")
    .eq("id", talentId)
    .maybeSingle();

  if (beforeErr || !before) return { error: "Talent profile not found." };

  // ── Update talent_profiles ─────────────────────────────────────────────────
  const profilePatch: Record<string, unknown> = {
    display_name: d.display_name,
    first_name: d.first_name || null,
    last_name: d.last_name || null,
    short_bio: d.short_bio || null,
    phone: d.phone || null,
    updated_at: new Date().toISOString(),
  };

  if (d.workflow_status) profilePatch.workflow_status = d.workflow_status;
  if (d.visibility) profilePatch.visibility = d.visibility;

  const { error: updateErr } = await admin
    .from("talent_profiles")
    .update(profilePatch)
    .eq("id", talentId);

  if (updateErr) {
    logServerError("roster/[id].updateRosterTalentProfile/profile", updateErr);
    return { error: "Could not update the profile. Try again." };
  }

  // ── Update agency_talent_roster visibility if provided ─────────────────────
  if (d.agency_visibility) {
    const { error: rosterErr } = await admin
      .from("agency_talent_roster")
      .update({ agency_visibility: d.agency_visibility })
      .eq("id", rosterRowId);

    if (rosterErr) {
      logServerError("roster/[id].updateRosterTalentProfile/rosterVisibility", rosterErr);
      // Non-fatal — profile already saved
    }
  }

  // ── Taxonomy: update primary talent type ───────────────────────────────────
  if ("talent_type_term_id" in raw.data) {
    // Remove existing primary_role term(s) for this profile
    const { error: removeErr } = await admin
      .from("talent_profile_taxonomy")
      .delete()
      .eq("talent_profile_id", talentId)
      .eq("relationship_type", "primary_role");

    if (removeErr) {
      logServerError("roster/[id].updateRosterTalentProfile/removeTaxonomy", removeErr);
    }

    // Insert new one if provided
    if (d.talent_type_term_id) {
      const { error: insertErr } = await admin
        .from("talent_profile_taxonomy")
        .insert({
          talent_profile_id: talentId,
          taxonomy_term_id: d.talent_type_term_id,
          relationship_type: "primary_role",
          is_primary: true,
        });

      if (insertErr) {
        logServerError("roster/[id].updateRosterTalentProfile/insertTaxonomy", insertErr);
        // Non-fatal
      }
    }
  }

  // ── Workflow event audit ───────────────────────────────────────────────────
  try {
    const beforeProfile = before as { workflow_status: string; visibility: string };
    if (d.workflow_status && d.workflow_status !== beforeProfile.workflow_status) {
      await admin.from("talent_workflow_events").insert({
        talent_profile_id: talentId,
        actor_user_id: userId,
        event_type: "workflow_status_changed",
        payload: { from: beforeProfile.workflow_status, to: d.workflow_status, note: null },
      });
    }
    if (d.visibility && d.visibility !== beforeProfile.visibility) {
      await admin.from("talent_workflow_events").insert({
        talent_profile_id: talentId,
        actor_user_id: userId,
        event_type: "visibility_changed",
        payload: { from: beforeProfile.visibility, to: d.visibility, note: null },
      });
    }
  } catch (e) {
    logServerError("roster/[id].updateRosterTalentProfile/workflowEvents", e);
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  return { success: true };
}

// ─── Register roster photo after client-side storage upload ──────────────────

export type RegisterPhotoResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: string };

/**
 * Called after the client has already uploaded the file bytes to Supabase storage.
 * Soft-deletes the previous card-variant asset, then inserts the new media_assets row.
 * The storage path must be under `{talentId}/public/` — validated here.
 */
export async function registerRosterTalentPhoto(
  tenantSlug: string,
  talentId: string,
  storagePath: string,
  width: number,
  height: number,
): Promise<RegisterPhotoResult> {
  const ctx = await resolveEditContext(tenantSlug, talentId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  if (!storagePath.startsWith(`${talentId}/`)) {
    return { ok: false, error: "Invalid storage path." };
  }

  const { admin } = ctx;
  const BUCKET = "media-public";
  const now = new Date().toISOString();

  // Soft-delete previous card asset if any.
  await admin
    .from("media_assets")
    .update({ deleted_at: now, updated_at: now })
    .eq("owner_talent_profile_id", talentId)
    .eq("variant_kind", "card")
    .is("deleted_at", null);

  const { data: inserted, error: insErr } = await admin
    .from("media_assets")
    .insert({
      owner_talent_profile_id: talentId,
      uploaded_by_user_id: ctx.userId,
      bucket_id: BUCKET,
      storage_path: storagePath,
      variant_kind: "card",
      sort_order: 0,
      approval_state: "approved",
      width,
      height,
      metadata: { slot: "avatar", crop_mode: "avatar" },
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    logServerError("roster/[id].registerRosterTalentPhoto/insert", insErr);
    return { ok: false, error: "Could not save photo. Try again." };
  }

  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  return { ok: true, publicUrl };
}

// ─── Quick workflow toggle (sidebar) ─────────────────────────────────────────

const workflowSchema = z.object({
  workflow_status: z.enum(["draft", "invited", "approved", "published", "hidden"]),
  visibility: z.enum(["hidden", "public", "private"]),
});

export async function updateRosterTalentWorkflow(
  tenantSlug: string,
  talentId: string,
  _prev: RosterTalentEditState,
  formData: FormData,
): Promise<RosterTalentEditState> {
  const ctx = await resolveEditContext(tenantSlug, talentId);
  if (!ctx.ok) return { error: ctx.error };

  const raw = workflowSchema.safeParse({
    workflow_status: trim(formData.get("workflow_status")),
    visibility: trim(formData.get("visibility")),
  });

  if (!raw.success) return { error: "Invalid workflow status." };

  const { admin, userId } = ctx;
  const { workflow_status, visibility } = raw.data;

  const { data: before } = await admin
    .from("talent_profiles")
    .select("workflow_status, visibility")
    .eq("id", talentId)
    .maybeSingle();

  const { error } = await admin
    .from("talent_profiles")
    .update({ workflow_status, visibility, updated_at: new Date().toISOString() })
    .eq("id", talentId);

  if (error) {
    logServerError("roster/[id].updateRosterTalentWorkflow", error);
    return { error: "Could not update status. Try again." };
  }

  // Audit
  try {
    const b = before as { workflow_status: string; visibility: string } | null;
    if (b && workflow_status !== b.workflow_status) {
      await admin.from("talent_workflow_events").insert({
        talent_profile_id: talentId,
        actor_user_id: userId,
        event_type: "workflow_status_changed",
        payload: { from: b.workflow_status, to: workflow_status, note: "sidebar quick control" },
      });
    }
    if (b && visibility !== b.visibility) {
      await admin.from("talent_workflow_events").insert({
        talent_profile_id: talentId,
        actor_user_id: userId,
        event_type: "visibility_changed",
        payload: { from: b.visibility, to: visibility, note: "sidebar quick control" },
      });
    }
  } catch (e) {
    logServerError("roster/[id].updateRosterTalentWorkflow/events", e);
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  return { success: true };
}
