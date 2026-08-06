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
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { residenceCityPatchFromText } from "@/lib/residence-city-sync";
import { notifyTalentProfileApproved } from "@/lib/notifications/producers/talent-profile-approved-notify";
import { assertTalentReadyForPublicListing } from "@/lib/field-engine/profile-publish-server-gate";

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
  invitation_email: z
    .string()
    .optional()
    .transform((v) => v?.trim() ?? "")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Enter a valid email address.",
    }),
  home_city_text: z.string().optional().transform((v) => v?.trim() ?? ""),
  // Canonical, inclusive gender option-set (Tier-C-tail, 2026-06-10) — values
  // are the display strings stored verbatim in talent_profiles.gender, in
  // lockstep with profile_field_definitions(identity.gender).options + the
  // directory facet config.
  gender: z
    .enum([
      "Woman",
      "Man",
      "Non-binary",
      "Trans woman",
      "Trans man",
      "Transgender",
      "Genderfluid",
      "Genderqueer",
      "Agender",
      "Bigender",
      "Two-Spirit",
      "Intersex",
      "Prefer to self-describe",
      "Prefer not to say",
      "",
    ])
    .optional()
    .transform((v) => (v === "" ? null : (v ?? null))),
  date_of_birth: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  /** Instagram handle — stored inside social_links JSONB. */
  instagram: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return null;
      // Normalise: strip leading @ and whitespace
      return v.trim().replace(/^@/, "");
    }),
  workflow_status: z
    .enum(["draft", "invited", "approved", "published", "hidden"])
    .optional(),
  visibility: z
    .enum(["hidden", "public", "private"])
    .optional(),
  agency_visibility: z
    .enum(["roster_only", "site_visible", "featured"])
    .optional(),
  talent_type_term_id: pgUuidSchema()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Height in centimetres. Stored as NUMERIC in talent_profiles. */
  height_cm: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return null;
      const n = parseFloat(v.trim());
      return isNaN(n) || n < 50 || n > 280 ? null : n;
    }),
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
    display_name:      trim(formData.get("display_name")),
    first_name:        trim(formData.get("first_name")),
    last_name:         trim(formData.get("last_name")),
    short_bio:         trim(formData.get("short_bio")),
    phone:             trim(formData.get("phone")),
    invitation_email:  trim(formData.get("invitation_email")),
    home_city_text:    trim(formData.get("home_city_text")),
    gender:            trim(formData.get("gender")),
    date_of_birth:     trim(formData.get("date_of_birth")) || undefined,
    instagram:         trim(formData.get("instagram")) || undefined,
    workflow_status:   trim(formData.get("workflow_status")) || undefined,
    visibility:        trim(formData.get("visibility")) || undefined,
    agency_visibility: trim(formData.get("agency_visibility")) || undefined,
    talent_type_term_id: trim(formData.get("talent_type_term_id")) || undefined,
    height_cm:         trim(formData.get("height_cm")) || undefined,
  });

  if (!raw.success) {
    return { error: raw.error.issues[0]?.message ?? "Validation failed." };
  }

  const d = raw.data;
  const { admin, tenantId, userId, rosterRowId } = ctx;

  // ── Phase 5-ε: canonical-first height write ────────────────────────────────
  // `talent_profiles.height_cm` is a denormalized column; the canonical store
  // is `talent_profile_field_values` keyed by `physical.height_cm`. Seed
  // canonical BEFORE the denorm write below so the two never drift. Errors
  // here are logged but non-fatal — they must not block the form save.
  if (d.height_cm !== undefined) {
    try {
      const { data: defRow, error: defErr } = await admin
        .from("profile_field_definitions")
        .select("id")
        .eq("field_key", "physical.height_cm")
        .maybeSingle();
      if (defErr) {
        logServerError("roster/[id].updateRosterTalentProfile/canonicalHeightDefLookup", defErr);
      } else if (defRow) {
        const definitionId = (defRow as { id: string }).id;
        const heightVal = d.height_cm;
        if (heightVal === null) {
          const { error: delErr } = await admin
            .from("talent_profile_field_values")
            .delete()
            .eq("talent_profile_id", talentId)
            .eq("field_definition_id", definitionId);
          if (delErr) {
            // As with the upsert path: don't let the denormalized column be
            // cleared while the canonical store still holds a value.
            logServerError("roster/[id].updateRosterTalentProfile/canonicalHeightDelete", delErr);
            return { error: "Could not update height. Try again." };
          }
        } else {
          const { error: upsertErr } = await admin
            .from("talent_profile_field_values")
            .upsert(
              {
                tenant_id: tenantId,
                talent_profile_id: talentId,
                field_definition_id: definitionId,
                value: heightVal,
                workflow_state: "live",
                last_edited_role: "admin",
              },
              { onConflict: "talent_profile_id,field_definition_id" },
            );
          if (upsertErr) {
            // Canonical store is the source of truth product reads from. If this
            // write fails we must NOT proceed to the denormalized
            // talent_profiles.height_cm column update below — that would leave
            // the two stores disagreeing. Surface the failure to the caller.
            logServerError("roster/[id].updateRosterTalentProfile/canonicalHeightUpsert", upsertErr);
            return { error: "Could not update height. Try again." };
          }
        }
      }
    } catch (err) {
      logServerError("roster/[id].updateRosterTalentProfile/canonicalHeightCatch", err);
    }
  }

  // ── Load before state for workflow audit ───────────────────────────────────
  const { data: before, error: beforeErr } = await admin
    .from("talent_profiles")
    .select("workflow_status, visibility")
    .eq("id", talentId)
    .maybeSingle();

  if (beforeErr || !before) return { error: "Talent profile not found." };

  // ── Build social_links JSONB — merge instagram into existing entries ──────
  let socialLinksPatch: { label: string; href: string }[] | undefined;
  if ("instagram" in d) {
    // Load current social_links to preserve non-instagram entries
    const { data: currentProfile } = await admin
      .from("talent_profiles")
      .select("social_links")
      .eq("id", talentId)
      .maybeSingle();
    const currentLinks: { label: string; href: string }[] =
      (currentProfile as { social_links?: { label: string; href: string }[] } | null)?.social_links ?? [];
    // Remove old instagram entry, then prepend new one if provided
    const filtered = currentLinks.filter(
      (l) => l.label?.toLowerCase() !== "instagram",
    );
    if (d.instagram) {
      socialLinksPatch = [
        { label: "Instagram", href: `https://instagram.com/${d.instagram}` },
        ...filtered,
      ];
    } else {
      socialLinksPatch = filtered;
    }
  }

  // ── Update talent_profiles ─────────────────────────────────────────────────
  const profilePatch: Record<string, unknown> = {
    display_name:     d.display_name,
    first_name:       d.first_name || null,
    last_name:        d.last_name || null,
    short_bio:        d.short_bio || null,
    phone:            d.phone || null,
    invitation_email: d.invitation_email || null,
    home_city_text:   d.home_city_text || null,
    // Free-text city syncs the structured residence refs when it resolves to
    // exactly one canonical city (directory cards + map read the structured join).
    ...(await residenceCityPatchFromText(admin, d.home_city_text)),
    ...(d.gender !== undefined ? { gender: d.gender } : {}),
    ...(d.date_of_birth !== undefined ? { date_of_birth: d.date_of_birth } : {}),
    ...(d.height_cm !== undefined ? { height_cm: d.height_cm } : {}),
    ...(socialLinksPatch !== undefined ? { social_links: socialLinksPatch } : {}),
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
    // A partial unique index (ux_talent_profile_taxonomy_one_primary) enforces
    // exactly ONE primary_role row per talent, so we MUST delete the old before
    // inserting the new (insert-first would violate the index on every change).
    // To avoid the original bug — a swallowed insert failure leaving the talent
    // role-less while reporting success — we capture the prior primary first and
    // roll it back if the replacement insert fails, then surface the error.
    if (d.talent_type_term_id) {
      const { data: priorPrimary } = await admin
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id")
        .eq("talent_profile_id", talentId)
        .eq("relationship_type", "primary_role");

      const { error: removeErr } = await admin
        .from("talent_profile_taxonomy")
        .delete()
        .eq("talent_profile_id", talentId)
        .eq("relationship_type", "primary_role");
      if (removeErr) {
        logServerError("roster/[id].updateRosterTalentProfile/removeTaxonomy", removeErr);
        return { error: "Could not update talent type. Try again." };
      }

      const { error: insertErr } = await admin
        .from("talent_profile_taxonomy")
        .insert({
          talent_profile_id: talentId,
          taxonomy_term_id: d.talent_type_term_id,
          relationship_type: "primary_role",
          is_primary: true,
        });
      if (insertErr) {
        // Restore the prior primary_role row(s) so a failed swap never leaves
        // the talent without a primary type, then report the failure (fatal).
        logServerError("roster/[id].updateRosterTalentProfile/insertTaxonomy", insertErr);
        const restore = (priorPrimary ?? []).filter(
          (r): r is { taxonomy_term_id: string } => !!r.taxonomy_term_id,
        );
        if (restore.length > 0) {
          await admin.from("talent_profile_taxonomy").insert(
            restore.map((r) => ({
              talent_profile_id: talentId,
              taxonomy_term_id: r.taxonomy_term_id,
              relationship_type: "primary_role",
              is_primary: true,
            })),
          );
        }
        return { error: "Could not update talent type. Try again." };
      }
    } else {
      // Explicitly cleared: remove existing primary_role term(s).
      const { error: removeErr } = await admin
        .from("talent_profile_taxonomy")
        .delete()
        .eq("talent_profile_id", talentId)
        .eq("relationship_type", "primary_role");

      if (removeErr) {
        logServerError("roster/[id].updateRosterTalentProfile/removeTaxonomy", removeErr);
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

  scheduleWorkspaceAudit({
    tenantId,
    category: "roster",
    action: "roster.talent.updated",
    summary: `Updated talent profile ${d.display_name}`,
    targetType: "talent_profile",
    targetId: talentId,
    targetLabel: d.display_name,
    metadata: {
      changedKeys: Object.keys(profilePatch).filter((k) => k !== "updated_at"),
    },
  });

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  return { success: true };
}

// ─── Register roster photo after client-side storage upload ──────────────────

export type RegisterPhotoResult =
  | { ok: true; publicUrl: string; mediaId: string }
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
      tenant_id: ctx.tenantId,
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
    return { ok: false, error: insErr?.message ?? "Could not save photo. Try again." };
  }

  // Verify the row is actually readable back (catches RLS-after-insert and silent rollback).
  const { data: verify, error: verifyErr } = await admin
    .from("media_assets")
    .select("id, storage_path, tenant_id")
    .eq("id", inserted.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (verifyErr || !verify) {
    logServerError("roster/[id].registerRosterTalentPhoto/verify", verifyErr);
    return { ok: false, error: verifyErr?.message ?? "Saved, but could not verify the row." };
  }

  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

  scheduleWorkspaceAudit({
    tenantId: ctx.tenantId,
    category: "media",
    action: "media.photo.uploaded",
    summary: "Uploaded talent photo",
    targetType: "talent_profile",
    targetId: talentId,
    metadata: { mediaId: verify.id },
  });

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  return { ok: true, publicUrl, mediaId: verify.id };
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

  scheduleWorkspaceAudit({
    tenantId: ctx.tenantId,
    category: "roster",
    action: "roster.talent.workflow_updated",
    summary: `Changed talent workflow to ${workflow_status} and visibility to ${visibility}`,
    targetType: "talent_profile",
    targetId: talentId,
    metadata: { workflow_status, visibility },
  });

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  return { success: true };
}

// ─── Agency directory visibility — the roster-card "eye" toggle ──────────────

/**
 * Flip a roster talent's agency directory visibility.
 *
 *   visible = true  → agency_visibility = 'site_visible'
 *                     (listed in this agency's directory + search + public page)
 *   visible = false → agency_visibility = 'roster_only'
 *                     (kept on the roster, not shown publicly)
 *
 * This is the agency-side public gate that replaces the old Draft/Published
 * workflow, and since 20260803203521 it is the sole input to
 * `talent_profiles.is_publicly_listed` — the column the directory, the Discover
 * matview and the media RLS policy all read. Flipping the eye on is therefore
 * the real approve action, so it clears the same publish checklist the drawer's
 * Publish button enforces.
 *
 * A talent whose `is_publicly_hidden` is true stays hidden publicly regardless —
 * that global kill-switch belongs to the talent, not the agency.
 */
export async function setRosterTalentSiteVisibility(
  tenantSlug: string,
  talentId: string,
  visible: boolean,
): Promise<RosterTalentEditState> {
  const ctx = await resolveEditContext(tenantSlug, talentId);
  if (!ctx.ok) return { error: ctx.error };

  const { admin, userId, tenantId, rosterRowId, currentAgencyVisibility } = ctx;
  const next = visible ? "site_visible" : "roster_only";

  // 'featured' already counts as visible — don't demote a featured talent
  // just because the eye was clicked "on".
  if (visible && currentAgencyVisibility === "featured") return { success: true };
  if (currentAgencyVisibility === next) return { success: true };

  // Publish checklist — only when going public. Hiding is always allowed, and
  // must stay allowed: an agency has to be able to pull an incomplete profile
  // down without first filling in the fields that made it incomplete.
  if (visible) {
    const ready = await assertTalentReadyForPublicListing({
      supabase: admin,
      tenantId,
      talentProfileId: talentId,
    });
    if (!ready.ok) return { error: ready.error };
  }

  const { error } = await admin
    .from("agency_talent_roster")
    .update({ agency_visibility: next })
    .eq("id", rosterRowId);

  if (error) {
    logServerError("roster/[id].setRosterTalentSiteVisibility", error);
    return { error: "Could not update visibility. Try again." };
  }

  try {
    await admin.from("talent_workflow_events").insert({
      tenant_id: tenantId,
      talent_profile_id: talentId,
      actor_user_id: userId,
      event_type: "agency_visibility_changed",
      payload: { from: currentAgencyVisibility, to: next, note: "roster eye toggle" },
    });
  } catch (e) {
    logServerError("roster/[id].setRosterTalentSiteVisibility/events", e);
  }

  // talent.profile_approved (spec §6.3) — the talent just became site-visible
  // (from a non-visible, non-featured state, per the early returns above), so
  // their profile is now discoverable to clients. Fire-and-forget; deduped per
  // tenant+talent so re-toggling the eye won't re-email.
  if (visible) {
    void notifyTalentProfileApproved({ admin, tenantId, talentProfileId: talentId });
  }

  scheduleWorkspaceAudit({
    tenantId,
    category: "roster",
    action: "roster.talent.visibility_changed",
    summary: visible
      ? "Talent is now shown on the public site"
      : "Talent is now hidden from the public site",
    targetType: "talent_profile",
    targetId: talentId,
    metadata: { from: currentAgencyVisibility, to: next },
  });

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
  revalidateDirectoryListing();
  return { success: true };
}
