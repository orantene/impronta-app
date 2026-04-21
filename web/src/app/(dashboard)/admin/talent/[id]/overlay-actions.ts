"use server";

/**
 * Phase 5/6 M3 — agency talent overlay write path.
 *
 * Admin edits the tenant-scoped overlay row for a canonical talent profile.
 * The overlay only renders on the agency surface (`/t/[profileCode]` served
 * on an agency host) — Gate 3 enforces the read-side boundary. Here we
 * simply insert/update the row in the active tenant's scope.
 *
 * Guard rails:
 *   - {@link requireStaffTenantAction} authenticates agency staff AND
 *     resolves the active tenant via the scope cookie/header — no implicit
 *     fallback to the seed tenant. Any tamper lands on the RLS policy
 *     (`is_staff_of_tenant(tenant_id)`) as defense-in-depth.
 *   - The talent must be on this tenant's roster before we accept the write.
 *     Without a roster row, the overlay has no public read path (the
 *     `agency_talent_overlays_public_select` policy requires one) — writing
 *     anyway would just create dangling data. We reject with a clear error.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type OverlayActionState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const overlaySaveSchema = z.object({
  talent_profile_id: z.string().uuid("Missing talent profile."),
  display_headline: z
    .string()
    .trim()
    .max(160, "Headline must be 160 characters or fewer.")
    .optional()
    .default(""),
  local_bio: z
    .string()
    .trim()
    .max(4000, "Local bio must be 4,000 characters or fewer.")
    .optional()
    .default(""),
  cover_media_asset_id: z
    .string()
    .trim()
    .optional()
    .default(""),
  local_tags: z
    .string()
    .optional()
    .default(""),
});

function parseLocalTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20);
}

function nullIfEmpty(v: string): string | null {
  return v.length === 0 ? null : v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveAgencyTalentOverlay(
  _prev: OverlayActionState,
  formData: FormData,
): Promise<OverlayActionState> {
  const parsed = overlaySaveSchema.safeParse({
    talent_profile_id: formData.get("talent_profile_id"),
    display_headline: formData.get("display_headline") ?? "",
    local_bio: formData.get("local_bio") ?? "",
    cover_media_asset_id: formData.get("cover_media_asset_id") ?? "",
    local_tags: formData.get("local_tags") ?? "",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid overlay input.";
    return { error: first };
  }

  const guard = await requireStaffTenantAction();
  if (!guard.ok) return { error: guard.error };
  const { supabase, tenantId } = guard;

  const talentProfileId = parsed.data.talent_profile_id;

  // Roster gate — overlay has no public read path without a site-visible
  // roster row (see `agency_talent_overlays_public_select`). We still allow
  // saving for `roster_only` rows so editors can prep copy before flipping
  // visibility, but the talent MUST be on this tenant's roster in some form.
  const { data: roster, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("status, agency_visibility")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (rosterErr) {
    logServerError("admin/talent/overlay/roster-check", rosterErr);
    return { error: CLIENT_ERROR.update };
  }
  if (!roster) {
    return {
      error:
        "Add this talent to your roster before authoring an overlay.",
    };
  }

  let coverMediaAssetId: string | null = null;
  const coverRaw = parsed.data.cover_media_asset_id.trim();
  if (coverRaw.length > 0) {
    if (!UUID_RE.test(coverRaw)) {
      return { error: "Cover media id must be a UUID." };
    }
    // Verify the asset exists and is approved/live. Staff sees only tenant-
    // accessible media via RLS; this also prevents pointing at a deleted row.
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id")
      .eq("id", coverRaw)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .maybeSingle();
    if (!asset) {
      return { error: "Cover media not found or not approved." };
    }
    coverMediaAssetId = coverRaw;
  }

  const payload = {
    tenant_id: tenantId,
    talent_profile_id: talentProfileId,
    display_headline: nullIfEmpty(parsed.data.display_headline),
    local_bio: nullIfEmpty(parsed.data.local_bio),
    cover_media_asset_id: coverMediaAssetId,
    local_tags: parseLocalTags(parsed.data.local_tags),
  };

  const { error: upsertErr } = await supabase
    .from("agency_talent_overlays")
    .upsert(payload, { onConflict: "tenant_id,talent_profile_id" });
  if (upsertErr) {
    logServerError("admin/talent/overlay/upsert", upsertErr);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath(`/admin/talent/${talentProfileId}`);
  return { success: true, message: "Overlay saved." };
}

const overlayClearSchema = z.object({
  talent_profile_id: z.string().uuid("Missing talent profile."),
});

export async function clearAgencyTalentOverlay(
  _prev: OverlayActionState,
  formData: FormData,
): Promise<OverlayActionState> {
  const parsed = overlayClearSchema.safeParse({
    talent_profile_id: formData.get("talent_profile_id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const guard = await requireStaffTenantAction();
  if (!guard.ok) return { error: guard.error };
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("agency_talent_overlays")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", parsed.data.talent_profile_id);
  if (error) {
    logServerError("admin/talent/overlay/delete", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath(`/admin/talent/${parsed.data.talent_profile_id}`);
  return { success: true, message: "Overlay cleared." };
}
