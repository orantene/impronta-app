import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { buildTemplateSnapshot, templateKeyForPlan } from "@/lib/talent-site/templates/registry";
import { validateTalentSiteSnapshot } from "@/lib/talent-site/validation";
import { loadTalentStarterProfileData } from "./load-starter-data";

/**
 * Ensures a talent_sites draft row exists for the profile (all tiers).
 * Idempotent — no-op when row already present.
 */
export async function provisionTalentPersonalSiteIfMissing(
  talentProfileId: string,
  planKey: string,
  createdByUserId?: string | null,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Not configured." };
  }

  const { data: existing } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();

  if (existing) {
    return { ok: true, created: false };
  }

  const profile = await loadTalentStarterProfileData(talentProfileId);
  if (!profile) {
    return { ok: false, error: "Could not load profile for site provisioning." };
  }

  const { data: mediaRows } = await admin
    .from("media_assets")
    .select("storage_path")
    .eq("owner_talent_profile_id", talentProfileId)
    .in("variant_kind", ["public_watermarked", "gallery", "portfolio"])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(12);

  const BUCKET = "media-public";
  const media = (mediaRows ?? []).map((row) => {
    const r = row as { storage_path: string };
    return {
      url: admin.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
      alt: profile.displayName,
    };
  });

  const templateKey = templateKeyForPlan(planKey);
  const snapshot = buildTemplateSnapshot(templateKey, { profile, media });
  const validated = validateTalentSiteSnapshot(snapshot, { planKey });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from("talent_sites")
    .insert({
      talent_profile_id: talentProfileId,
      site_kind: "talent_personal",
      status: "draft",
      draft_snapshot: validated.snapshot,
      version: 1,
      draft_updated_at: now,
      created_by: createdByUserId ?? null,
      updated_by: createdByUserId ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    logServerError("talentSite.provision.insert", insertErr);
    return { ok: false, error: "Could not provision personal site." };
  }

  await admin.from("talent_site_revisions").insert({
    talent_site_id: (inserted as { id: string }).id,
    talent_profile_id: talentProfileId,
    kind: "draft",
    version: 1,
    snapshot: validated.snapshot,
    created_by: createdByUserId ?? null,
  });

  return { ok: true, created: true };
}
