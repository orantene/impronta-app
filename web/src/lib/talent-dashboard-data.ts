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
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { resolveTalentTermsVersion } from "@/lib/talent-submission-service";
import { buildTalentPreviewHref } from "@/lib/talent-nav-groups";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";

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

    const [{ data: assignmentRows, error: aErr }, { data: allTerms, error: termsErr }] =
      await Promise.all([
        supabase
          .from("talent_profile_taxonomy")
          .select("taxonomy_term_id, is_primary, taxonomy_terms(kind)")
          .eq("talent_profile_id", profile.id),
        supabase
          .from("taxonomy_terms")
          .select("id, kind, slug, name_en, name_es, sort_order")
          .is("archived_at", null)
          .order("kind")
          .order("sort_order"),
      ]);

    if (aErr) {
      logServerError("talent/taxonomyEditor/assignments", aErr);
      return { ok: false, reason: "load_error" };
    }
    if (termsErr) {
      logServerError("talent/taxonomyEditor/terms", termsErr);
      return { ok: false, reason: "load_error" };
    }

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

    // Field-driven governance: only show taxonomy fields that are active + editable by talent.
    const { data: fieldRows, error: fErr } = await supabase
      .from("field_definitions")
      .select(
        "key, label_en, label_es, taxonomy_kind, sort_order, field_groups(sort_order)",
      )
      .eq("active", true)
      .is("archived_at", null)
      .eq("editable_by_talent", true)
      .eq("profile_visible", true)
      .eq("internal_only", false)
      .in("value_type", ["taxonomy_single", "taxonomy_multi"])
      .not("taxonomy_kind", "is", null);

    if (fErr) {
      logServerError("talent/taxonomyEditor/fields", fErr);
      return { ok: false, reason: "load_error" };
    }

    const editableFields: TalentEditableTaxonomyField[] = (fieldRows ?? [])
      .map((row) => {
        const fg = row.field_groups as { sort_order: number } | { sort_order: number }[] | null;
        const groupSort = Array.isArray(fg) ? fg[0]?.sort_order ?? 0 : fg?.sort_order ?? 0;
        return {
          key: row.key as string,
          label_en: row.label_en as string,
          label_es: (row.label_es as string | null) ?? null,
          taxonomy_kind: row.taxonomy_kind as string,
          sort_order: (row.sort_order as number) ?? 0,
          group_sort_order: groupSort,
        };
      })
      .filter((f) => f.taxonomy_kind !== "location_city" && f.taxonomy_kind !== "location_country")
      .sort((a, b) => a.group_sort_order - b.group_sort_order || a.sort_order - b.sort_order);

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
      { data: fieldGroups },
      { data: fieldDefs },
      { data: fieldValues },
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
        supabase
          .from("field_groups")
          .select("id, slug, name_en, name_es, sort_order, archived_at")
          .is("archived_at", null)
          .order("sort_order"),
        supabase
          .from("field_definitions")
          .select(
            "id, field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, config, archived_at",
          )
          .eq("active", true)
          .is("archived_at", null)
          .eq("editable_by_talent", true)
          .eq("profile_visible", true)
          .eq("internal_only", false)
          .order("field_group_id")
          .order("sort_order"),
        supabase
          .from("field_values")
          .select("field_definition_id, value_text, value_number, value_boolean, value_date")
          .eq("talent_profile_id", typedProfile.id),
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

    const editableDefinitions = filterOutReservedFieldDefinitions(
      ((fieldDefs ?? []) as FieldDefinitionRow[]).filter((d) => d.value_type !== "location"),
    );
    const groupIdsUsed = new Set<string>();
    for (const d of editableDefinitions) {
      if (d.field_group_id) groupIdsUsed.add(d.field_group_id);
    }
    const groups = ((fieldGroups ?? []) as FieldGroupRow[]).filter((g) => groupIdsUsed.has(g.id));
    const editableByGroup = new Map<string, FieldDefinitionRow[]>();
    for (const d of editableDefinitions) {
      const gid = d.field_group_id ?? "ungrouped";
      const arr = editableByGroup.get(gid) ?? [];
      arr.push(d);
      editableByGroup.set(gid, arr);
    }
    const scalarEditableIds = editableDefinitions
      .filter((d) => ["text", "textarea", "number", "boolean", "date"].includes(d.value_type))
      .map((d) => d.id);

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
      fieldValues: (fieldValues ?? []) as Array<{
        field_definition_id: string;
        value_text: string | null;
        value_number: number | null;
        value_boolean: boolean | null;
        value_date: string | null;
      }>,
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
      fieldCatalog: {
        groups,
        editableDefinitions,
        editableByGroup,
        scalarEditableIds,
      },
      fieldValues: (fieldValues ?? []) as Array<{
        field_definition_id: string;
        value_text: string | null;
        value_number: number | null;
        value_boolean: boolean | null;
        value_date: string | null;
      }>,
      },
    };
  } catch (err) {
    await logDashboardLoaderFailure("loadTalentDashboardData", err, {
      userId: subjectId,
    });
    throw err;
  }
}
