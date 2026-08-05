import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCorePublishRequirements,
  buildProfilePublishRequirements,
  formatPublishBlockerError,
  isResolvedFieldPublishBlocking,
  validateProfileStatusTransition,
  type ProfilePublishRequirement,
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
  deleted_at: string | null;
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
    .select("workflow_status, visibility, display_name, home_city_text, deleted_at")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (profileError || !profile) throw profileError ?? new Error("Profile not found.");

  // Tenant-scoped OR tenant-null: primary_role rows are written with
  // tenant_id NULL by several flows (and the Discover matview + roster cards
  // read them without a tenant filter). Requiring `.eq(tenant_id)` here made
  // the gate stricter than every consumer — profiles whose card already
  // showed "fashion-model" were blocked with "Add Talent Type" on publish.
  const { data: primaryRows, error: primaryError } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", talentProfileId)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
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

/**
 * Build the publish requirement list for a talent without applying anything.
 *
 * Shared by the profile-drawer status transition and the roster "eye" toggle so
 * the two approve controls cannot disagree about what "ready to publish" means.
 */
async function loadPublishRequirements(input: {
  supabase: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}) {
  const { supabase, tenantId, talentProfileId } = input;
  const snapshot = await loadCorePublishSnapshot({ supabase, tenantId, talentProfileId });
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
  return { snapshot, requirements };
}

/**
 * Server-computed publish requirements for a talent — the SAME list the
 * publish gate enforces, exposed so the drawer's coach can reconcile with it.
 * The drawer computes requirements from its local editing state for instant
 * feedback; this is the authority (DB rows, resolver, tenant scoping). Any
 * item the server says is missing that the client thinks is met is real
 * drift the admin needs to see BEFORE clicking Publish, not after.
 */
export async function getServerPublishRequirements(input: {
  supabase: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<
  | { ok: true; requirements: ProfilePublishRequirement[]; deleted: boolean }
  | { ok: false; error: string }
> {
  try {
    const { snapshot, requirements } = await loadPublishRequirements(input);
    return { ok: true, requirements: [...requirements], deleted: !!snapshot.profile.deleted_at };
  } catch (error) {
    logServerError("profile-publish-server-gate.requirements", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

/**
 * Gate for the roster "eye" toggle (`setRosterTalentSiteVisibility`).
 *
 * Turning the eye on is the agency's real approve action, so it must clear the
 * same checklist the drawer's Publish enforces. Without this an agency could
 * make an incomplete profile site-visible — and, since the eye also fires the
 * `talent.profile_approved` email, tell the talent they were live while their
 * card rendered with no name, type, or bio.
 */
export async function assertTalentReadyForPublicListing(input: {
  supabase: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<Result> {
  try {
    const { snapshot, requirements } = await loadPublishRequirements(input);
    // Same rule as the status gate: deleted profiles can't go public (the
    // listing gate would refuse them anyway — fail loudly, not invisibly).
    if (snapshot.profile.deleted_at) {
      return {
        ok: false,
        error: "This profile was deleted, so it can't be made visible. Restore it first (or re-add the talent).",
      };
    }
    const missing = requirements.filter((requirement) => !requirement.met);
    if (missing.length > 0) {
      return { ok: false, error: formatPublishBlockerError(missing) };
    }
    return { ok: true };
  } catch (error) {
    logServerError("profile-publish-server-gate.assertReady", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

export async function applyProfileShellStatusWithPublishGate(input: {
  supabase: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
  nextStatus: UiProfileShellStatus;
}): Promise<Result> {
  const { supabase, tenantId, talentProfileId, nextStatus } = input;
  try {
    const { snapshot, requirements } = await loadPublishRequirements({
      supabase,
      tenantId,
      talentProfileId,
    });
    const currentStatus = dbToUiProfileShellStatus(
      snapshot.profile.workflow_status,
      snapshot.profile.visibility,
    );

    // A soft-deleted profile must never publish: `is_publicly_listed` (which
    // gates the directory, Discover and media RLS) refuses deleted rows, so
    // letting the status flip to approved here would "succeed" while the
    // talent stays invisible — a celebration over a profile nobody can see.
    // Found live: a roster card the admin could edit and publish was a row
    // soft-deleted at creation time (roster doesn't filter deleted_at yet).
    if (nextStatus === "published" && snapshot.profile.deleted_at) {
      return {
        ok: false,
        error: "This profile was deleted, so it can't be published. Restore it first (or re-add the talent).",
      };
    }

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
