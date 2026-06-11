import { cache } from "react";
import {
  buildTalentChecklist,
  calculateTalentCompletion,
  canSubmitTalentProfile,
  type TalentChecklistItem,
} from "@/lib/talent-dashboard";
import { filterOutReservedFieldDefinitions } from "@/lib/field-canonical";
import { buildTalentCompletionInput } from "@/lib/profile-completion";
import { logDashboardLoaderFailure } from "@/lib/dashboard-loader-diagnostics";
import {
  extractPrimaryRoleTerm,
  extractPrimaryRoleRow,
  type ProfileTaxonomyRow,
} from "@/lib/taxonomy/engine";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { resolveTalentTermsVersion } from "@/lib/talent-submission-service";
import { buildTalentPreviewHref } from "@/lib/talent-nav-groups";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import {
  readDashboardFieldCatalog,
  readDashboardTaxonomyEditableFields,
} from "@/lib/field-engine/read-source-dashboard-nav";

export type TalentDashboardProfileRow = {
  id: string;
  profile_code: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  bio_en: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  location_id: string | null;
  residence_country_id: string | null;
  residence_city_id: string | null;
  origin_country_id: string | null;
  origin_city_id: string | null;
  workflow_status: string;
  visibility: string;
  profile_completeness_score: number | null;
};

export type TalentMediaRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  variant_kind: string;
  approval_state: string;
  sort_order: number;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  /** Resolved public URL when bucket is readable (e.g. media-public). */
  publicUrl: string | null;
};

export type TalentRevisionRow = {
  id: string;
  status: string;
  created_at: string;
  payload: Record<string, unknown> | null;
};

export type TalentSubmissionSnapshotRow = {
  id: string;
  created_at: string;
  workflow_status_at_submit: string | null;
  completion_score_at_submit: number | null;
  snapshot: Record<string, unknown>;
};

export type TalentWorkflowEventRow = {
  id: string;
  created_at: string;
  event_type: string;
  payload: Record<string, unknown>;
};

export type TalentSubmissionConsentRow = {
  id: string;
  accepted_at: string;
  consent_type: string;
  terms_version: string;
  submission_context: string | null;
};

export type TalentSubmissionHistoryRow = {
  id: string;
  submitted_at: string;
  workflow_state_before: string | null;
  workflow_state_after: string | null;
  submission_kind: string;
  submission_snapshot_id: string | null;
  terms_consent_id: string | null;
  accepted_terms_version: string | null;
  source_revision_id: string | null;
};

export type TalentDashboardData = {
  userId: string;
  userEmail: string | null;
  /** False when the user only has OAuth (e.g. Google) and should use “set password” instead of “current password”. */
  accountHasEmailPassword: boolean;
  accountProfile: {
    display_name: string | null;
    account_status: string | null;
    avatar_url: string | null;
  } | null;
  profile: TalentDashboardProfileRow;
  media: TalentMediaRow[];
  revisions: TalentRevisionRow[];
  submissionSnapshots: TalentSubmissionSnapshotRow[];
  submissionHistory: TalentSubmissionHistoryRow[];
  submissionConsents: TalentSubmissionConsentRow[];
  workflowEvents: TalentWorkflowEventRow[];
  latestSubmission: TalentSubmissionHistoryRow | null;
  latestTermsConsent: TalentSubmissionConsentRow | null;
  latestWorkflowEvent: TalentWorkflowEventRow | null;
  talentTermsVersion: string;
  mediaCount: number;
  taxonomyCount: number;
  hasPrimaryTalentType: boolean;
  completionScore: number;
  checklist: TalentChecklistItem[];
  missingItems: TalentChecklistItem[];
  livePageAvailable: boolean;
  previewHref: string;
  canSubmit: boolean;
  fieldCatalog: {
    groups: FieldGroupRow[];
    editableDefinitions: FieldDefinitionRow[];
    editableByGroup: Map<string, FieldDefinitionRow[]>;
    scalarEditableIds: string[];
  };
  fieldValues: Array<{
    field_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_date: string | null;
  }>;
};

export type TalentDashboardLoadResult =
  | { ok: true; data: TalentDashboardData }
  | { ok: false; reason: "no_supabase" | "no_user" | "no_profile" };

/** Active taxonomy terms for talent self-service tagging (directory / merchandising). */
export type TalentTaxonomyTermOption = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
};

export type TalentEditableTaxonomyField = {
  key: string;
  label_en: string;
  label_es: string | null;
  taxonomy_kind: string;
  sort_order: number;
  group_sort_order: number;
};

export type TalentTaxonomyEditorLoadResult =
  | {
      ok: true;
      data: {
        talentProfileId: string;
        allTerms: TalentTaxonomyTermOption[];
        assignedIds: string[];
        /** Primary talent_type term id, if any. */
        primaryTalentTypeId: string | null;
        editableFields: TalentEditableTaxonomyField[];
      };
    }
  | { ok: false; reason: "no_supabase" | "no_user" | "no_profile" | "load_error" };

/**
 * Terms + current assignments for the taxonomy editor on Edit Profile.
 * Separate from {@link loadTalentDashboardData} so other routes do not fetch the full term list.
 */
export const loadTalentTaxonomyEditorData = cache(
  async (): Promise<TalentTaxonomyEditorLoadResult> => {
    const supabase = await getCachedServerSupabase();
    if (!supabase) return { ok: false, reason: "no_supabase" };

    const identity = await resolveDashboardIdentity();
    if (!identity) return { ok: false, reason: "no_user" };
    const subjectId = subjectUserId(identity);

    const { data: profile, error: pErr } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", subjectId)
      .maybeSingle();

    if (pErr || !profile) return { ok: false, reason: "no_profile" };

    // `archived_at IS NULL` alone ≈ 1068 rows > PostgREST's 1000-row cap, so an
    // un-paged select silently dropped terms past row 1000. Page by `id`, then
    // re-sort by the original display order (kind → sort_order) below.
    const [{ data: assignmentRows, error: aErr }, allTermsResult] = await Promise.all([
      supabase
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id, is_primary, taxonomy_terms(kind)")
        .eq("talent_profile_id", profile.id),
      fetchAllTaxonomyTerms<TalentTaxonomyTermOption>(
        supabase,
        "id, kind, slug, name_en, name_es, sort_order",
        (q) => q.is("archived_at", null),
      ).then(
        (rows) => ({ data: rows, error: null as null }),
        (error) => ({ data: null, error }),
      ),
    ]);

    if (aErr) {
      logServerError("talent/taxonomyEditor/assignments", aErr);
      return { ok: false, reason: "load_error" };
    }
    if (allTermsResult.error || !allTermsResult.data) {
      logServerError("talent/taxonomyEditor/terms", allTermsResult.error);
      return { ok: false, reason: "load_error" };
    }
    const allTerms = allTermsResult.data
      .slice()
      .sort(
        (a, b) =>
          (a.kind ?? "").localeCompare(b.kind ?? "") ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );

    const rows = (assignmentRows ?? []) as {
      taxonomy_term_id: string;
      is_primary: boolean;
      taxonomy_terms: { kind: string } | { kind: string }[] | null;
    }[];

    const assignedIds = rows.map((r) => r.taxonomy_term_id);
    // Engine-driven primary extraction (handles v2 + legacy).
    const primaryRow = extractPrimaryRoleRow(rows as unknown as ProfileTaxonomyRow[]);
    const primaryTalentTypeId: string | null =
      (primaryRow as unknown as { taxonomy_term_id?: string })?.taxonomy_term_id ?? null;

    // Field-driven governance: only show taxonomy fields that are active + editable
    // by talent. Routes through the field-engine read seam (`dashboard_nav` flag).
    let editableFields: TalentEditableTaxonomyField[];
    try {
      editableFields = await readDashboardTaxonomyEditableFields(supabase);
    } catch (fErr) {
      logServerError("talent/taxonomyEditor/fields", fErr);
      return { ok: false, reason: "load_error" };
    }

    return {
      ok: true,
      data: {
        talentProfileId: profile.id,
        allTerms: (allTerms ?? []) as TalentTaxonomyTermOption[],
        assignedIds,
        primaryTalentTypeId,
        editableFields,
      },
    };
  },
);

/**
 * Single cached loader per request for talent workspace shell and section pages.
 */
export const loadTalentDashboardData = cache(
  async (): Promise<TalentDashboardLoadResult> => {
    return loadTalentDashboardDataImpl();
  },
);

async function loadTalentDashboardDataImpl(): Promise<TalentDashboardLoadResult> {
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, reason: "no_supabase" };

  const identity = await resolveDashboardIdentity();
  if (!identity) return { ok: false, reason: "no_user" };
  const subjectId = subjectUserId(identity);
  const authUser = identity.actorUser;

  try {
  const [{ data: accountProfile }, { data: profile, error }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, account_status, avatar_url")
        .eq("id", subjectId)
        .maybeSingle(),
      supabase
        .from("talent_profiles")
        .select(
          `
        id,
        profile_code,
        display_name,
        first_name,
        last_name,
        short_bio,
        bio_en,
        phone,
        gender,
        date_of_birth,
        location_id,
        residence_country_id,
        residence_city_id,
        origin_country_id,
        origin_city_id,
        workflow_status,
        visibility,
        profile_completeness_score
      `,
        )
        .eq("user_id", subjectId)
        .maybeSingle(),
    ]);

    if (error || !profile) return { ok: false, reason: "no_profile" };

    const typedProfile = profile as TalentDashboardProfileRow;

    const [
      { data: revisions },
      { data: media },
      taxonomyRes,
      { data: snapshots },
      { data: submissionHistory },
      { data: submissionConsents },
      { data: events },
      // fieldCatalog + fieldValues are now routed through the field-engine read
      // seam (`dashboard_nav` flag). Default (`a`) is byte-identical to today;
      // `dashboard_nav:b` reads canonical System B. The seam safe-falls-back to
      // A if the B-read throws. Both readA and readB return the same shape.
      fieldCatalogAndValues,
      talentTermsVersion,
    ] =
      await Promise.all([
        supabase
          .from("profile_revisions")
          .select("id, status, created_at, payload")
          .eq("talent_profile_id", typedProfile.id)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("media_assets")
          .select(
            "id, bucket_id, storage_path, variant_kind, approval_state, sort_order, width, height, metadata, created_at",
          )
          .eq("owner_talent_profile_id", typedProfile.id)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
          .limit(48),
        supabase
          .from("talent_profile_taxonomy")
          .select("taxonomy_term_id, is_primary, taxonomy_terms(kind)", {
            count: "exact",
          })
          .eq("talent_profile_id", typedProfile.id),
        supabase
          .from("talent_submission_snapshots")
          .select("id, created_at, workflow_status_at_submit, completion_score_at_submit, snapshot")
          .eq("talent_profile_id", typedProfile.id)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("talent_submission_history")
          .select(
            "id, submitted_at, workflow_state_before, workflow_state_after, submission_kind, submission_snapshot_id, terms_consent_id, accepted_terms_version, source_revision_id",
          )
          .eq("talent_profile_id", typedProfile.id)
          .order("submitted_at", { ascending: false })
          .limit(8),
        supabase
          .from("talent_submission_consents")
          .select("id, accepted_at, consent_type, terms_version, submission_context")
          .eq("talent_profile_id", typedProfile.id)
          .order("accepted_at", { ascending: false })
          .limit(8),
        supabase
          .from("talent_workflow_events")
          .select("id, created_at, event_type, payload")
          .eq("talent_profile_id", typedProfile.id)
          .order("created_at", { ascending: false })
          .limit(12),
        readDashboardFieldCatalog(supabase, typedProfile.id),
        resolveTalentTermsVersion(supabase),
      ]);

    const rawMedia = (media ?? []) as Omit<TalentMediaRow, "publicUrl">[];
    const mediaRows: TalentMediaRow[] = rawMedia.map((row) => {
      let publicUrl: string | null = null;
      if (
        row.bucket_id === "media-public" &&
        typeof row.storage_path === "string" &&
        row.storage_path.length > 0
      ) {
        const { data } = supabase.storage.from("media-public").getPublicUrl(row.storage_path);
        publicUrl = data.publicUrl;
      }
      return {
        ...row,
        metadata:
          typeof row.metadata === "object" && row.metadata !== null
            ? (row.metadata as Record<string, unknown>)
            : {},
        publicUrl,
      };
    });
    const mediaCount = mediaRows.length;
    const taxonomyCount = taxonomyRes.count ?? 0;
    const taxonomyRows = (taxonomyRes.data ?? []) as {
      taxonomy_term_id: string;
      is_primary: boolean;
      taxonomy_terms: { kind: string } | { kind: string }[] | null;
    }[];

    // Engine-driven check (v2-aware).
    const hasPrimaryTalentType =
      extractPrimaryRoleTerm(taxonomyRows as unknown as ProfileTaxonomyRow[]) !== null;

    // Destructure the field catalog + values from the seam-dispatched read.
    const { catalog: fieldCatalog, fieldValues } = fieldCatalogAndValues;
    const { groups, editableDefinitions, editableByGroup, scalarEditableIds } = fieldCatalog;

    const completionInput = buildTalentCompletionInput({
      display_name: typedProfile.display_name,
      first_name: typedProfile.first_name,
      last_name: typedProfile.last_name,
      short_bio: typedProfile.short_bio,
      bio_en: typedProfile.bio_en,
      phone: typedProfile.phone,
      gender: typedProfile.gender,
      date_of_birth: typedProfile.date_of_birth,
      origin_country_id: typedProfile.origin_country_id,
      origin_city_id: typedProfile.origin_city_id,
      residence_city_id: typedProfile.residence_city_id,
      location_id: typedProfile.location_id,
      mediaCount,
      taxonomyCount,
      hasPrimaryTalentType,
      definitionsForScalarScoring: editableDefinitions,
      fieldValues,
    });
    const completionScore = calculateTalentCompletion(completionInput);
    const checklist = buildTalentChecklist(completionInput);
    const missingItems = checklist.filter((item) => !item.complete);
    const livePageAvailable =
      typedProfile.workflow_status === "approved" &&
      typedProfile.visibility === "public";
    const previewHref = buildTalentPreviewHref({
      profileCode: typedProfile.profile_code,
      workflowStatus: typedProfile.workflow_status,
      visibility: typedProfile.visibility,
    });
    const canSubmit = canSubmitTalentProfile(
      typedProfile.workflow_status,
      completionScore,
    );
    const typedSubmissionHistory = (submissionHistory ?? []) as TalentSubmissionHistoryRow[];
    const typedSubmissionConsents = (submissionConsents ?? []) as TalentSubmissionConsentRow[];
    const typedWorkflowEvents = ((events ?? []) as TalentWorkflowEventRow[]).map((e) => ({
      ...e,
      payload:
        typeof e.payload === "object" && e.payload !== null
          ? (e.payload as Record<string, unknown>)
          : {},
    }));

    return {
      ok: true,
      data: {
        userId: subjectId,
        userEmail: identity.isImpersonating ? null : authUser.email ?? null,
        accountHasEmailPassword: identity.isImpersonating
          ? false
          : userHasEmailPasswordIdentity(authUser),
        accountProfile,
        profile: typedProfile,
        media: mediaRows,
        revisions: (revisions ?? []) as TalentRevisionRow[],
        submissionSnapshots: ((snapshots ?? []) as TalentSubmissionSnapshotRow[]).map((s) => ({
          ...s,
          snapshot:
            typeof s.snapshot === "object" && s.snapshot !== null
              ? (s.snapshot as Record<string, unknown>)
              : {},
        })),
        submissionHistory: typedSubmissionHistory,
        submissionConsents: typedSubmissionConsents,
        workflowEvents: typedWorkflowEvents,
        latestSubmission: typedSubmissionHistory[0] ?? null,
        latestTermsConsent: typedSubmissionConsents[0] ?? null,
        latestWorkflowEvent: typedWorkflowEvents[0] ?? null,
        talentTermsVersion,
        mediaCount,
        taxonomyCount,
        hasPrimaryTalentType,
        completionScore,
        checklist,
        missingItems,
        livePageAvailable,
        previewHref,
        canSubmit,
      fieldCatalog,
      fieldValues,
      },
    };
  } catch (err) {
    await logDashboardLoaderFailure("loadTalentDashboardData", err, {
      userId: subjectId,
    });
    throw err;
  }
}
