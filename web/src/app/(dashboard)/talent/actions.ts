"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readCanonicalLocationSelection,
  resolveCanonicalLocationSelection,
  validateCanonicalLocationSelection,
} from "@/lib/canonical-location";
import { requireTalent } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import {
  assignTaxonomyTermToProfile,
  removeTaxonomyTermFromProfile,
} from "@/lib/talent-taxonomy-service";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { buildTalentCompletionInput, type ScalarCompletionDefinition } from "@/lib/profile-completion";
import { calculateTalentCompletion, TALENT_SUBMISSION_THRESHOLD } from "@/lib/talent-dashboard";
import { resolveTalentTermsVersion } from "@/lib/talent-submission-service";
import { appendTranslationAudit } from "@/lib/translation/audit";
import {
  buildBioEnEditExtras,
  type TalentBioRow,
} from "@/lib/translation/talent-bio-translation-service";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";

export type TalentFormState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

export async function updateTalentProfile(
  _prev: TalentFormState,
  formData: FormData,
): Promise<TalentFormState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const { data: profileRow, error: profileError } = await supabase
    .from("talent_profiles")
    .select("id, bio_en, bio_es, bio_es_draft, bio_es_status, short_bio")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profileRow) return { error: "Talent profile not found." };

  const display_name = String(formData.get("display_name") ?? "").trim();
  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const short_bio = String(formData.get("short_bio") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const date_of_birth = String(formData.get("date_of_birth") ?? "").trim();
  const residence = readCanonicalLocationSelection(formData, "residence");

  const residenceError = validateCanonicalLocationSelection(residence, {
    required: true,
    label: "Residence",
  });
  if (residenceError) return { error: residenceError };

  let residenceResolved: { countryId: string; cityId: string } | null = null;
  try {
    residenceResolved = await resolveCanonicalLocationSelection(supabase, residence);
  } catch (error) {
    logServerError("talent/updateTalentProfile/resolveCanonicalLocation", error);
    return { error: "Selected location is not available." };
  }

  if (!residenceResolved) return { error: "Residence country and city are required." };

  const origin = readCanonicalLocationSelection(formData, "origin");
  const originError = validateCanonicalLocationSelection(origin, {
    required: false,
    label: "Originally from",
  });
  if (originError) return { error: originError };

  let originResolved: { countryId: string; cityId: string } | null = null;
  if (origin.country && origin.city) {
    try {
      originResolved = await resolveCanonicalLocationSelection(supabase, origin);
    } catch (error) {
      logServerError("talent/updateTalentProfile/resolveCanonicalOrigin", error);
      return { error: "Selected origin location is not available." };
    }
    if (!originResolved) return { error: "Origin country and city could not be saved." };
  }

  const completionScore = await computeTalentCompletionScore(supabase, {
    id: profileRow.id,
    display_name,
    first_name,
    last_name,
    short_bio,
    bio_en: null,
    phone,
    gender,
    date_of_birth: date_of_birth || null,
    residence_city_id: residenceResolved.cityId,
    origin_country_id: originResolved?.countryId ?? null,
    origin_city_id: originResolved?.cityId ?? null,
  });

  const nowIso = new Date().toISOString();
  const bioExtras = buildBioEnEditExtras({
    talentProfileId: profileRow.id,
    prev: profileRow as TalentBioRow,
    nextShortBio: short_bio || null,
    actorId: user.id,
    nowIso,
  });

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      display_name: display_name || null,
      first_name: first_name || null,
      last_name: last_name || null,
      ...bioExtras.payload,
      phone: phone || null,
      gender: gender || null,
      date_of_birth: date_of_birth || null,
      location_id: residenceResolved.cityId,
      residence_country_id: residenceResolved.countryId,
      residence_city_id: residenceResolved.cityId,
      origin_country_id: originResolved?.countryId ?? null,
      origin_city_id: originResolved?.cityId ?? null,
      profile_completeness_score: completionScore,
      updated_at: nowIso,
    })
    .eq("id", profileRow.id);

  if (error) {
    logServerError("talent/updateTalentProfile", error);
    return { error: CLIENT_ERROR.update };
  }

  if (bioExtras.audit) {
    await appendTranslationAudit(supabase, bioExtras.audit);
  }

  await scheduleRebuildAiSearchDocument(supabase, profileRow.id);

  revalidatePath("/talent", "layout");
  return {
    success: true,
    message: "Draft saved. You can come back later and continue editing.",
  };
}

export async function submitProfileRevision(
  _prev: TalentFormState,
  formData: FormData,
): Promise<TalentFormState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const note = String(formData.get("revision_note") ?? "").trim();
  if (!note) return { error: "Add a short note for the agency." };

  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !profile) return { error: "Talent profile not found." };

  const { data: inserted, error } = await supabase
    .from("profile_revisions")
    .insert({
      talent_profile_id: profile.id,
      created_by_user_id: user.id,
      payload: { note, source: "talent_dashboard" },
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    logServerError("talent/submitProfileRevision", error);
    return { error: CLIENT_ERROR.update };
  }
  if (!inserted?.id) {
    logServerError("talent/submitProfileRevision", new Error("Insert returned no row"));
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/talent", "layout");
  revalidatePath("/talent/status");
  revalidatePath("/talent/my-profile");
  redirect("/talent/status?revision=sent");
}

export async function submitTalentForReview(
  _prev: TalentFormState,
  formData: FormData,
): Promise<TalentFormState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const confirmation = String(formData.get("submission_confirmation") ?? "").trim();
  if (confirmation !== "confirmed") {
    return { error: "Confirm that your profile is ready before submitting." };
  }
  const termsAccepted = String(formData.get("terms_acceptance") ?? "").trim();
  if (termsAccepted !== "accepted") {
    return { error: "Accept the current submission terms before sending your profile for review." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("talent_profiles")
    .select("id, workflow_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) return { error: "Talent profile not found." };

  const completionScore = await computeTalentCompletionScore(supabase, profile);
  if (completionScore < TALENT_SUBMISSION_THRESHOLD) {
    return {
      error: `Profile completion must reach ${TALENT_SUBMISSION_THRESHOLD}% before submission.`,
    };
  }

  if (!["draft", "hidden"].includes(profile.workflow_status)) {
    return {
      error: "Only draft or hidden profiles can be submitted for review.",
    };
  }

  const termsVersion = await resolveTalentTermsVersion(supabase);
  const [{ data: taxonomyRows }, { data: locationRow }] = await Promise.all([
    supabase
      .from("talent_profile_taxonomy")
      .select("taxonomy_term_id, is_primary, taxonomy_terms(kind)")
      .eq("talent_profile_id", profile.id),
    supabase
      .from("talent_profiles")
      .select("location_id")
      .eq("id", profile.id)
      .maybeSingle(),
  ]);

  const typedTaxonomy = (taxonomyRows ?? []) as {
    taxonomy_term_id: string;
    is_primary: boolean;
    taxonomy_terms: { kind: string } | { kind: string }[] | null;
  }[];

  const primaryTalentTypeTermId =
    typedTaxonomy.find((r) => {
      const t = r.taxonomy_terms;
      const kind = Array.isArray(t) ? t[0]?.kind : t?.kind;
      return kind === "talent_type" && r.is_primary;
    })?.taxonomy_term_id ?? null;

  const snapshot = {
    version: 2,
    completionScore,
    location_id: locationRow?.location_id ?? null,
    taxonomy: {
      term_ids: typedTaxonomy.map((r) => r.taxonomy_term_id),
      primary_talent_type_term_id: primaryTalentTypeTermId,
    },
    source: "talent_submit_for_review",
  };

  const submissionContext =
    profile.workflow_status === "hidden" ? "resubmission" : "initial_submit";

  const { error } = await supabase.rpc("submit_own_talent_profile_for_review", {
    p_terms_version: termsVersion,
    p_submission_context: submissionContext,
    p_completion_score: completionScore,
    p_snapshot: snapshot,
    p_source_revision_id: null,
  });

  if (error) {
    logServerError("talent/submitTalentForReview", error);
    return {
      error:
        typeof error.message === "string" && error.message.trim().length > 0
          ? error.message
          : CLIENT_ERROR.update,
    };
  }

  await scheduleRebuildAiSearchDocument(supabase, profile.id);

  revalidatePath("/talent", "layout");
  return {
    success: true,
    message: `Profile submitted for review under terms version ${termsVersion}. The agency queue has been updated.`,
  };
}

async function computeTalentCompletionScore(
  supabase: SupabaseClient,
  profile: {
    id: string;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    short_bio?: string | null;
    bio_en?: string | null;
    phone?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    origin_country_id?: string | null;
    origin_city_id?: string | null;
    residence_city_id?: string | null;
  },
) {
  const [
    { data: taxonomyRows },
    { count: mediaCount },
    { data: currentProfile },
    { data: scalarFieldDefs },
    { data: fieldValues },
  ] = await Promise.all([
    supabase
      .from("talent_profile_taxonomy")
      .select("taxonomy_term_id, is_primary, taxonomy_terms(kind)")
      .eq("talent_profile_id", profile.id),
    supabase
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .eq("owner_talent_profile_id", profile.id)
      .is("deleted_at", null),
    supabase
      .from("talent_profiles")
      .select(
        "display_name, first_name, last_name, short_bio, bio_en, phone, gender, date_of_birth, location_id, residence_city_id, origin_country_id, origin_city_id",
      )
      .eq("id", profile.id)
      .maybeSingle(),
    supabase
      .from("field_definitions")
      .select("id, key, value_type, required_level")
      .eq("active", true)
      .is("archived_at", null)
      .eq("editable_by_talent", true)
      .eq("profile_visible", true)
      .eq("internal_only", false)
      .in("value_type", ["text", "textarea", "number", "boolean", "date"]),
    supabase
      .from("field_values")
      .select("field_definition_id, value_text, value_number, value_boolean, value_date")
      .eq("talent_profile_id", profile.id),
  ]);

  const typedTaxonomy = (taxonomyRows ?? []) as {
    taxonomy_term_id: string;
    is_primary: boolean;
    taxonomy_terms: { kind: string } | { kind: string }[] | null;
  }[];
  const hasPrimaryTalentType = typedTaxonomy.some((r) => {
    const t = r.taxonomy_terms;
    const kind = Array.isArray(t) ? t[0]?.kind : t?.kind;
    return kind === "talent_type" && r.is_primary;
  });
  const taxonomyCount = typedTaxonomy.length;

  const defs = ((scalarFieldDefs ?? []) as Array<{
    id: string;
    key: string;
    value_type: string;
    required_level: string;
  }>).filter((d) => !isReservedTalentProfileFieldKey(d.key));
  const values = (fieldValues ?? []) as Array<{
    field_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_date: string | null;
  }>;

  return calculateTalentCompletion(
    buildTalentCompletionInput({
      display_name: profile.display_name ?? currentProfile?.display_name ?? null,
      first_name: profile.first_name ?? currentProfile?.first_name ?? null,
      last_name: profile.last_name ?? currentProfile?.last_name ?? null,
      short_bio:
        profile.short_bio ??
        currentProfile?.short_bio ??
        null,
      bio_en:
        profile.bio_en ??
        (currentProfile as { bio_en?: string | null } | null)?.bio_en ??
        null,
      phone: profile.phone ?? (currentProfile as { phone?: string | null } | null)?.phone ?? null,
      gender: profile.gender ?? (currentProfile as { gender?: string | null } | null)?.gender ?? null,
      date_of_birth: profile.date_of_birth ?? (currentProfile as { date_of_birth?: string | null } | null)?.date_of_birth ?? null,
      origin_country_id:
        profile.origin_country_id ??
        (currentProfile as { origin_country_id?: string | null } | null)?.origin_country_id ??
        null,
      origin_city_id:
        profile.origin_city_id ??
        (currentProfile as { origin_city_id?: string | null } | null)?.origin_city_id ??
        null,
      residence_city_id: profile.residence_city_id ?? currentProfile?.residence_city_id ?? null,
      location_id: currentProfile?.location_id ?? null,
      mediaCount: mediaCount ?? 0,
      taxonomyCount,
      hasPrimaryTalentType,
      definitionsForScalarScoring: defs as ScalarCompletionDefinition[],
      fieldValues: values,
    }),
  );
}

export async function assignTaxonomyToSelf(
  _prev: TalentFormState,
  formData: FormData,
): Promise<TalentFormState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const taxonomy_term_id = String(formData.get("taxonomy_term_id") ?? "").trim();
  if (!taxonomy_term_id) return { error: "Missing taxonomy term." };

  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !profile) return { error: "Talent profile not found." };

  const result = await assignTaxonomyTermToProfile(supabase, {
    talentProfileId: profile.id,
    taxonomyTermId: taxonomy_term_id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/talent", "layout");
  revalidateDirectoryListing();
  return { success: true, message: "Tag added." };
}

export async function removeTaxonomyFromSelf(
  _prev: TalentFormState,
  formData: FormData,
): Promise<TalentFormState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const taxonomy_term_id = String(formData.get("taxonomy_term_id") ?? "").trim();
  if (!taxonomy_term_id) return { error: "Missing taxonomy term." };

  const { data: profile, error: pErr } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !profile) return { error: "Talent profile not found." };

  const result = await removeTaxonomyTermFromProfile(supabase, {
    talentProfileId: profile.id,
    taxonomyTermId: taxonomy_term_id,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/talent", "layout");
  revalidateDirectoryListing();
  return { success: true, message: "Tag removed." };
}
