"use server";

// Phase 3.12 / Roster — extended talent edit server actions.
//
// Covers: multi-role taxonomy assignment, languages CRUD, service areas
// CRUD, portfolio gallery upload/remove/reorder, delete-talent.
//
// Capability: agency.roster.edit (or stricter for delete).

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Result<T = null> = { ok: true; data?: T } | { ok: false; error: string };

async function gate(tenantSlug: string, capability: "agency.roster.edit" | "agency.roster.manage" = "agency.roster.edit") {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Workspace not found." };
  const can = await userHasCapability(capability, scope.tenantId);
  if (!can) return { ok: false as const, error: "Not authorised." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Service role unavailable." };
  const supabase = await createSupabaseServerClient();
  return { ok: true as const, scope, admin, supabase };
}

async function rosterMatch(
  admin: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  talentProfileId: string,
): Promise<boolean> {
  if (!admin) return false;
  const { data } = await admin
    .from("agency_talent_roster")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  return Boolean(data);
}

function refresh(tenantSlug: string, talentId: string) {
  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidatePath(`/${tenantSlug}/admin/roster/${talentId}`);
}

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

/**
 * Add a taxonomy term assignment with the given relationship_type.
 * relationship_type values used by the prototype:
 *   - "primary_role"   (set is_primary=true; mutually exclusive with other primary_role for the same talent)
 *   - "secondary_role"
 *   - "skill"
 *   - "context"
 *   - "attribute"
 *   - "language"
 */
export async function addTalentTaxonomyTerm(
  tenantSlug: string,
  talentId: string,
  termId: string,
  relationshipType: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;
    if (!(await rosterMatch(r.admin, r.scope.tenantId, talentId))) {
      return { ok: false, error: "Talent not on this roster." };
    }

    // For primary_role, clear existing primary_role assignment(s) first.
    if (relationshipType === "primary_role") {
      await r.admin
        .from("talent_profile_taxonomy")
        .delete()
        .eq("talent_profile_id", talentId)
        .eq("relationship_type", "primary_role");
    }

    const { error } = await r.admin
      .from("talent_profile_taxonomy")
      .upsert(
        {
          talent_profile_id: talentId,
          taxonomy_term_id: termId,
          tenant_id: r.scope.tenantId,
          relationship_type: relationshipType,
          is_primary: relationshipType === "primary_role",
          display_order: 0,
        },
        { onConflict: "talent_profile_id,taxonomy_term_id,relationship_type" },
      );

    if (error) {
      logServerError("roster.addTalentTaxonomyTerm", error);
      return { ok: false, error: "Could not assign term." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.addTalentTaxonomyTerm", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function removeTalentTaxonomyTerm(
  tenantSlug: string,
  talentId: string,
  termId: string,
  relationshipType: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;

    const { error } = await r.admin
      .from("talent_profile_taxonomy")
      .delete()
      .eq("talent_profile_id", talentId)
      .eq("taxonomy_term_id", termId)
      .eq("relationship_type", relationshipType);

    if (error) {
      logServerError("roster.removeTalentTaxonomyTerm", error);
      return { ok: false, error: "Could not remove term." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.removeTalentTaxonomyTerm", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Languages ────────────────────────────────────────────────────────────────

export async function addTalentLanguage(
  tenantSlug: string,
  talentId: string,
  input: {
    languageCode: string;
    languageName: string;
    speakingLevel?: string;
    isNative?: boolean;
    canHost?: boolean;
    canSell?: boolean;
    canTranslate?: boolean;
    canTeach?: boolean;
  },
): Promise<Result<{ id: string }>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;
    if (!(await rosterMatch(r.admin, r.scope.tenantId, talentId))) {
      return { ok: false, error: "Talent not on this roster." };
    }

    const { data: existing } = await r.admin
      .from("talent_languages")
      .select("id")
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId)
      .eq("language_code", input.languageCode.toLowerCase())
      .maybeSingle();
    if (existing) {
      refresh(tenantSlug, talentId);
      return { ok: true, data: { id: (existing as { id: string }).id } };
    }

    const { data: maxRow } = await r.admin
      .from("talent_languages")
      .select("display_order")
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow as { display_order: number } | null)?.display_order ?? 0) + 1;

    const { data, error } = await r.admin
      .from("talent_languages")
      .insert({
        tenant_id: r.scope.tenantId,
        talent_profile_id: talentId,
        language_code: input.languageCode.toLowerCase(),
        language_name: input.languageName,
        speaking_level: input.speakingLevel ?? "fluent",
        is_native: input.isNative ?? false,
        can_host: input.canHost ?? true,
        can_sell: input.canSell ?? false,
        can_translate: input.canTranslate ?? false,
        can_teach: input.canTeach ?? false,
        display_order: nextOrder,
      })
      .select("id")
      .single();

    if (error || !data) {
      logServerError("roster.addTalentLanguage", error);
      return { ok: false, error: "Could not add language." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    logServerError("roster.addTalentLanguage", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function updateTalentLanguage(
  tenantSlug: string,
  talentId: string,
  languageId: string,
  patch: Partial<{
    speakingLevel: string;
    isNative: boolean;
    canHost: boolean;
    canSell: boolean;
    canTranslate: boolean;
    canTeach: boolean;
  }>,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;

    const update: Record<string, unknown> = {};
    if (patch.speakingLevel != null) update.speaking_level = patch.speakingLevel;
    if (patch.isNative      != null) update.is_native = patch.isNative;
    if (patch.canHost       != null) update.can_host = patch.canHost;
    if (patch.canSell       != null) update.can_sell = patch.canSell;
    if (patch.canTranslate  != null) update.can_translate = patch.canTranslate;
    if (patch.canTeach      != null) update.can_teach = patch.canTeach;

    if (Object.keys(update).length === 0) return { ok: true };

    const { error } = await r.admin
      .from("talent_languages")
      .update(update)
      .eq("id", languageId)
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId);

    if (error) {
      logServerError("roster.updateTalentLanguage", error);
      return { ok: false, error: "Could not update language." };
    }
    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.updateTalentLanguage", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function removeTalentLanguage(
  tenantSlug: string,
  talentId: string,
  languageId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;

    const { error } = await r.admin
      .from("talent_languages")
      .delete()
      .eq("id", languageId)
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId);

    if (error) {
      logServerError("roster.removeTalentLanguage", error);
      return { ok: false, error: "Could not remove language." };
    }
    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.removeTalentLanguage", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Service areas ────────────────────────────────────────────────────────────

export async function addTalentServiceArea(
  tenantSlug: string,
  talentId: string,
  input: {
    serviceKind: "home_base" | "frequent" | "occasional" | "available_for_travel" | string;
    city?: string;
    travelRadiusKm?: number;
    travelFeeRequired?: boolean;
    notes?: string;
  },
): Promise<Result<{ id: string }>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;
    if (!(await rosterMatch(r.admin, r.scope.tenantId, talentId))) {
      return { ok: false, error: "Talent not on this roster." };
    }

    // Only one home_base per talent — promote.
    if (input.serviceKind === "home_base") {
      await r.admin
        .from("talent_service_areas")
        .update({ service_kind: "frequent" })
        .eq("tenant_id", r.scope.tenantId)
        .eq("talent_profile_id", talentId)
        .eq("service_kind", "home_base");
    }

    const { data: maxRow } = await r.admin
      .from("talent_service_areas")
      .select("display_order")
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow as { display_order: number } | null)?.display_order ?? 0) + 1;

    const { data, error } = await r.admin
      .from("talent_service_areas")
      .insert({
        tenant_id: r.scope.tenantId,
        talent_profile_id: talentId,
        service_kind: input.serviceKind,
        city: input.city ?? null,
        travel_radius_km: input.travelRadiusKm ?? null,
        travel_fee_required: input.travelFeeRequired ?? false,
        notes: input.notes ?? null,
        display_order: nextOrder,
      })
      .select("id")
      .single();

    if (error || !data) {
      logServerError("roster.addTalentServiceArea", error);
      return { ok: false, error: "Could not add service area." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    logServerError("roster.addTalentServiceArea", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function removeTalentServiceArea(
  tenantSlug: string,
  talentId: string,
  serviceAreaId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;

    const { error } = await r.admin
      .from("talent_service_areas")
      .delete()
      .eq("id", serviceAreaId)
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId);

    if (error) {
      logServerError("roster.removeTalentServiceArea", error);
      return { ok: false, error: "Could not remove area." };
    }
    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.removeTalentServiceArea", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Portfolio gallery ────────────────────────────────────────────────────────

/**
 * Add a portfolio photo. Caller has already uploaded the file blob to the
 * media-public bucket at `talent-portfolio/{talentId}/{uuid}.{ext}`. We
 * record the metadata row + assign sort_order at the end of the gallery.
 */
export async function registerPortfolioPhoto(
  tenantSlug: string,
  talentId: string,
  input: {
    storagePath: string;
    width?: number;
    height?: number;
    fileSize?: number;
    mimeType?: string;
  },
): Promise<Result<{ id: string }>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;
    if (!(await rosterMatch(r.admin, r.scope.tenantId, talentId))) {
      return { ok: false, error: "Talent not on this roster." };
    }

    const me = (await r.supabase?.auth.getUser())?.data.user?.id ?? null;

    const { data: maxRow } = await r.admin
      .from("media_assets")
      .select("sort_order")
      .eq("owner_talent_profile_id", talentId)
      .eq("variant_kind", "gallery")
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

    const { data, error } = await r.admin
      .from("media_assets")
      .insert({
        tenant_id: r.scope.tenantId,
        owner_talent_profile_id: talentId,
        uploaded_by_user_id: me,
        bucket_id: "media-public",
        storage_path: input.storagePath,
        variant_kind: "gallery",
        approval_state: "approved",
        width: input.width ?? null,
        height: input.height ?? null,
        file_size: input.fileSize ?? null,
        sort_order: nextOrder,
        // `purpose` is a media_purpose enum: ('talent' | 'branding' | 'cms' |
        // 'starter_kit'). Talent portfolio photos are 'talent'. Writing
        // 'portfolio_photo' (the original literal here) failed the enum
        // check and bubbled up as "Could not save photo." in the UI.
        purpose: "talent",
        metadata: { mime_type: input.mimeType ?? null, role: "portfolio" },
      })
      .select("id")
      .single();

    if (error || !data) {
      logServerError("roster.registerPortfolioPhoto", error);
      return { ok: false, error: "Could not save photo." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    logServerError("roster.registerPortfolioPhoto", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Soft-delete a portfolio photo + remove the underlying blob best-effort. */
export async function removePortfolioPhoto(
  tenantSlug: string,
  talentId: string,
  mediaAssetId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;

    const { data: row } = await r.admin
      .from("media_assets")
      .select("bucket_id, storage_path")
      .eq("id", mediaAssetId)
      .eq("owner_talent_profile_id", talentId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Photo not found." };

    const { error } = await r.admin
      .from("media_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mediaAssetId);

    if (error) {
      logServerError("roster.removePortfolioPhoto.update", error);
      return { ok: false, error: "Could not delete photo." };
    }

    const m = row as { bucket_id: string; storage_path: string };
    r.admin.storage.from(m.bucket_id).remove([m.storage_path]).catch((err) =>
      logServerError("roster.removePortfolioPhoto.storage", err),
    );

    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.removePortfolioPhoto", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Delete talent ────────────────────────────────────────────────────────────

/**
 * Remove a talent from the agency roster. Sets status='removed' on the
 * roster row + removed_at timestamp. The talent_profiles row stays
 * intact (might be on another agency's roster, or might claim itself
 * later) — only the agency's relationship is severed.
 *
 * Redirects back to /admin/roster on success.
 */
export async function removeTalentFromRoster(
  tenantSlug: string,
  talentId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;

    const { error } = await r.admin
      .from("agency_talent_roster")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("talent_profile_id", talentId);

    if (error) {
      logServerError("roster.removeTalentFromRoster", error);
      return { ok: false, error: "Could not remove talent." };
    }

    revalidatePath(`/${tenantSlug}/admin/roster`);
  } catch (err) {
    logServerError("roster.removeTalentFromRoster", err);
    return { ok: false, error: "Unexpected error." };
  }

  // Redirect outside try/catch so Next's NEXT_REDIRECT throw isn't swallowed.
  redirect(`/${tenantSlug}/admin/roster`);
}

// ─── Avatar / Hero assignment ─────────────────────────────────────────────────

/** Set a media_assets row as the talent's primary avatar (variant_kind='card'). */
export async function setTalentAvatar(
  tenantSlug: string,
  talentId: string,
  mediaAssetId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;
    if (!(await rosterMatch(r.admin, r.scope.tenantId, talentId))) {
      return { ok: false, error: "Talent not on this roster." };
    }

    const now = new Date().toISOString();

    await r.admin
      .from("media_assets")
      .update({ deleted_at: now, updated_at: now })
      .eq("owner_talent_profile_id", talentId)
      .eq("variant_kind", "card")
      .neq("id", mediaAssetId)
      .is("deleted_at", null);

    const { error } = await r.admin
      .from("media_assets")
      .update({ variant_kind: "card", sort_order: 0, updated_at: now })
      .eq("id", mediaAssetId)
      .eq("owner_talent_profile_id", talentId);

    if (error) {
      logServerError("roster.setTalentAvatar", error);
      return { ok: false, error: "Could not set avatar." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.setTalentAvatar", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Set a media_assets row as the talent's primary hero (variant_kind='hero'). */
export async function setTalentHero(
  tenantSlug: string,
  talentId: string,
  mediaAssetId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug);
    if (!r.ok) return r;
    if (!(await rosterMatch(r.admin, r.scope.tenantId, talentId))) {
      return { ok: false, error: "Talent not on this roster." };
    }

    const now = new Date().toISOString();

    await r.admin
      .from("media_assets")
      .update({ deleted_at: now, updated_at: now })
      .eq("owner_talent_profile_id", talentId)
      .eq("variant_kind", "hero")
      .neq("id", mediaAssetId)
      .is("deleted_at", null);

    const { error } = await r.admin
      .from("media_assets")
      .update({ variant_kind: "hero", sort_order: 0, updated_at: now })
      .eq("id", mediaAssetId)
      .eq("owner_talent_profile_id", talentId);

    if (error) {
      logServerError("roster.setTalentHero", error);
      return { ok: false, error: "Could not set hero photo." };
    }

    refresh(tenantSlug, talentId);
    return { ok: true };
  } catch (err) {
    logServerError("roster.setTalentHero", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Hard-delete the talent profile entirely. Use with caution — only for
 * talent that the agency created itself and that has no other roster
 * memberships. The DB cascade will sweep taxonomy, languages, service
 * areas, media metadata. Storage blobs are best-effort.
 */
export async function hardDeleteTalent(
  tenantSlug: string,
  talentId: string,
): Promise<Result<null>> {
  try {
    const r = await gate(tenantSlug, "agency.roster.manage");
    if (!r.ok) return r;

    // Only allow if this is the only agency that has it on roster.
    const { data: rosterRows } = await r.admin
      .from("agency_talent_roster")
      .select("tenant_id, status")
      .eq("talent_profile_id", talentId);
    const live = (rosterRows ?? []).filter(
      (x: { status: string }) => x.status !== "removed",
    );
    const onOtherAgencies = live.some(
      (x: { tenant_id: string }) => x.tenant_id !== r.scope.tenantId,
    );
    if (onOtherAgencies) {
      return {
        ok: false,
        error: "This talent is on another agency's roster. Remove from your roster instead.",
      };
    }

    const { data: profile } = await r.admin
      .from("talent_profiles")
      .select("user_id, created_by_agency_id")
      .eq("id", talentId)
      .maybeSingle();
    const p = profile as { user_id: string | null; created_by_agency_id: string | null } | null;
    if (p?.user_id) {
      return {
        ok: false,
        error: "This talent has claimed their account. Use Remove from roster instead.",
      };
    }
    if (p?.created_by_agency_id && p.created_by_agency_id !== r.scope.tenantId) {
      return { ok: false, error: "Created by another agency — can't hard delete." };
    }

    // Best-effort: clean up media blobs first.
    const { data: media } = await r.admin
      .from("media_assets")
      .select("bucket_id, storage_path")
      .eq("owner_talent_profile_id", talentId);
    for (const m of (media ?? []) as { bucket_id: string; storage_path: string }[]) {
      r.admin.storage.from(m.bucket_id).remove([m.storage_path]).catch((err) =>
        logServerError("roster.hardDeleteTalent.storage", err),
      );
    }

    const { error: profileErr } = await r.admin
      .from("talent_profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", talentId);

    if (profileErr) {
      logServerError("roster.hardDeleteTalent", profileErr);
      return { ok: false, error: "Could not delete talent." };
    }

    revalidatePath(`/${tenantSlug}/admin/roster`);
  } catch (err) {
    logServerError("roster.hardDeleteTalent", err);
    return { ok: false, error: "Unexpected error." };
  }

  redirect(`/${tenantSlug}/admin/roster`);
}
