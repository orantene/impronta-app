import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCorePublishRequirements,
  buildProfilePublishRequirements,
  isResolvedFieldPublishBlocking,
  validateProfileStatusTransition,
} from "@/lib/field-engine/profile-publish-requirements";
import { resolveTalentFields } from "@/lib/field-engine/resolve-talent-fields";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  dbToUiProfileShellStatus,
  uiProfileShellStatusToDbPatch,
  type UiProfileShellStatus,
} from "@/lib/talent/profile-shell-workflow";

type Result = { ok: true } | { ok: false; error: string };

type ProfilePublishSnapshot = {
  workflow_status: string | null;
  visibility: string | null;
  display_name: string | null;
  home_city_text: string | null;
};

function activeBioLength(bios: unknown): number {
  if (!Array.isArray(bios)) return 0;
  return bios.reduce((max, entry) => {
    if (!entry || typeof entry !== "object") return max;
    const text = String((entry as Record<string, unknown>).text ?? "").trim();
    return Math.max(max, text.length);
  }, 0);
}

async function loadCorePublishSnapshot(input: {
  supabase: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<{
  profile: ProfilePublishSnapshot;
  primaryType: string | null;
  totalPhotos: number;
  languageCount: number;
  activeBioLen: number;
}> {
  const { supabase, tenantId, talentProfileId } = input;
  // `bios` is System-B only since the T4 blob-column collapse — it was DROPPED
  // from talent_profiles, so it must NOT appear in this select (doing so threw
  // "column talent_profiles.bios does not exist" and broke every publish/status
  // transition). Read it from the catalog value store below.
  const { data: profile, error: profileError } = await supabase
    .from("talent_profiles")
    .select("workflow_status, visibility, display_name, home_city_text")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (profileError || !profile) throw profileError ?? new Error("Profile not found.");

  const { data: primaryRows, error: primaryError } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", talentProfileId)
    .eq("tenant_id", tenantId)
    .eq("relationship_type", "primary_role")
    .limit(1);
  if (primaryError) throw primaryError;

  const [photoRows, languageRows, blobValues] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .eq("owner_talent_profile_id", talentProfileId)
      .is("deleted_at", null)
      // Real media_variant_kind values only — `portfolio` is NOT an enum member,
      // so listing it made PostgREST reject the whole query (this gate then threw
      // on `photoRows.error`, breaking every publish/status transition). `hero`
      // is the valid 4:5 cover and counts as a public photo.
      .in("variant_kind", ["card", "public_watermarked", "gallery", "hero"]),
    supabase
      .from("talent_languages")
      .select("id", { count: "exact", head: true })
      .eq("talent_profile_id", talentProfileId)
      .eq("tenant_id", tenantId),
    // bios lives in System B (catalog value store) post-T4 column collapse.
    readBlobFieldValuesFromCatalog(supabase, talentProfileId),
  ]);
  if (photoRows.error) throw photoRows.error;
  if (languageRows.error) throw languageRows.error;

  return {
    profile: profile as ProfilePublishSnapshot,
    primaryType: primaryRows?.[0]?.taxonomy_term_id ?? null,
    totalPhotos: photoRows.count ?? 0,
    languageCount: languageRows.count ?? 0,
    activeBioLen: activeBioLength(blobValues.bios),
  };
}

export async function applyProfileShellStatusWithPublishGate(input: {
  supabase: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
  nextStatus: UiProfileShellStatus;
}): Promise<Result> {
  const { supabase, tenantId, talentProfileId, nextStatus } = input;
  try {
    const snapshot = await loadCorePublishSnapshot({ supabase, tenantId, talentProfileId });
    const currentStatus = dbToUiProfileShellStatus(
      snapshot.profile.workflow_status,
      snapshot.profile.visibility,
    );
    const resolved = await resolveTalentFields({
      supabase,
      tenantId,
      talentProfileId,
      viewerRole: "agency_admin",
    });
    const resolverMissing = resolved.ok
      ? resolved.fields
          .filter((field) => isResolvedFieldPublishBlocking(field) && !field.has_value)
          .map((field) => ({
            id: `field:${field.field_definition_id}`,
            label: field.label,
            groupKey: field.field_group_slug ?? undefined,
          }))
      : [];
    const requirements = buildProfilePublishRequirements({
      core: buildCorePublishRequirements({
        stageName: snapshot.profile.display_name ?? "",
        primaryType: snapshot.primaryType,
        homeBase: snapshot.profile.home_city_text ?? "",
        totalPhotos: snapshot.totalPhotos,
        activeBioLength: snapshot.activeBioLen,
        languageCount: snapshot.languageCount,
      }),
      resolverMissing,
    });

    const transition = validateProfileStatusTransition({
      role: "admin",
      currentStatus,
      nextStatus,
      requirements,
    });
    if (!transition.ok) return { ok: false, error: transition.error };

    const patch = {
      ...uiProfileShellStatusToDbPatch(nextStatus),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("talent_profiles")
      .update(patch)
      .eq("id", talentProfileId);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    logServerError("profile-publish-server-gate.apply", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
