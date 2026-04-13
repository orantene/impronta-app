export const TALENT_SUBMISSION_THRESHOLD = 70;

/**
 * Soft recommendation for copy length in the form (not a checklist gate).
 * Checklist treats any non-empty trimmed bio as complete so UX matches “I filled this in.”
 */
export const TALENT_SHORT_BIO_RECOMMENDED_MIN_CHARS = 40;

export function isTalentShortBioComplete(
  short_bio: string | null | undefined,
  bio_en?: string | null,
): boolean {
  return Boolean((bio_en ?? "").trim() || (short_bio ?? "").trim());
}

/**
 * "Originally from" on the public page uses canonical origin country + city (see talent profile form).
 */
export function isTalentOriginComplete(input: {
  origin_country_id?: string | null;
  origin_city_id?: string | null;
}): boolean {
  return Boolean(input.origin_country_id && input.origin_city_id);
}

export type TalentCompletionInput = {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  bio_en?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  origin_country_id?: string | null;
  origin_city_id?: string | null;
  residence_city_id?: string | null;
  location_id?: string | null;
  mediaCount: number;
  taxonomyCount: number;
  /** Stronger completion signal than raw taxonomyCount. */
  hasPrimaryTalentType?: boolean;
  /** Scalar field system completion (non-taxonomy, non-location). */
  requiredScalarFieldsTotal?: number;
  requiredScalarFieldsComplete?: number;
  recommendedScalarFieldsTotal?: number;
  recommendedScalarFieldsComplete?: number;
};

export type TalentChecklistItem = {
  key: string;
  label: string;
  description: string;
  complete: boolean;
};

export function buildTalentChecklist(
  input: TalentCompletionInput,
): TalentChecklistItem[] {
  const taxonomyComplete =
    input.hasPrimaryTalentType !== undefined
      ? input.hasPrimaryTalentType
      : input.taxonomyCount > 0;
  const requiredTotal = input.requiredScalarFieldsTotal ?? 0;
  const requiredComplete = input.requiredScalarFieldsComplete ?? 0;
  const recommendedTotal = input.recommendedScalarFieldsTotal ?? 0;
  const recommendedComplete = input.recommendedScalarFieldsComplete ?? 0;
  const hasScalarFieldTracking = requiredTotal + recommendedTotal > 0;
  return [
    {
      key: "display_name",
      label: "Profile name",
      description: "Set the name shown across the directory and dashboard.",
      complete: Boolean(input.display_name?.trim()),
    },
    {
      key: "first_name",
      label: "First name",
      description: "Required. Helps staff confirm identity during review.",
      complete: Boolean(input.first_name?.trim()),
    },
    {
      key: "last_name",
      label: "Last name",
      description: "Required. Helps staff confirm identity during review.",
      complete: Boolean(input.last_name?.trim()),
    },
    {
      key: "phone",
      label: "Phone number",
      description: "Agency-private contact number. Required before submission.",
      complete: Boolean(input.phone?.trim()),
    },
    {
      key: "gender",
      label: "Gender",
      description: "Required for agency classification and matching.",
      complete: Boolean(input.gender?.trim()),
    },
    {
      key: "date_of_birth",
      label: "Date of birth",
      description: "Required for agency records and age verification.",
      complete: Boolean(input.date_of_birth?.trim()),
    },
    {
      key: "origin",
      label: "Originally from",
      description:
        "Choose your hometown (country + city) so your public profile can show where you’re from.",
      complete: isTalentOriginComplete(input),
    },
    {
      key: "location",
      label: "Lives in",
      description: "Set your residence so you appear correctly in the directory.",
      complete: Boolean(input.residence_city_id ?? input.location_id),
    },
    {
      key: "short_bio",
      label: "Short bio",
      description:
        "Public. Add a clear sentence or two so the agency can understand your positioning.",
      complete: isTalentShortBioComplete(input.short_bio, input.bio_en),
    },
    {
      key: "taxonomy",
      label: "Talent type",
      description: "Choose a primary talent type to appear correctly in the directory.",
      complete: taxonomyComplete,
    },
    {
      key: "media",
      label: "Portfolio media",
      description: "Upload at least one image so review and matching can start.",
      complete: input.mediaCount > 0,
    },
    ...(hasScalarFieldTracking
      ? ([
          {
            key: "fields_required",
            label: "Required profile fields",
            description:
              requiredTotal > 0
                ? `${requiredComplete}/${requiredTotal} required field${requiredTotal === 1 ? "" : "s"} completed.`
                : "No required scalar fields are enabled right now.",
            complete: requiredTotal === 0 || requiredComplete >= requiredTotal,
          },
          {
            key: "fields_recommended",
            label: "Recommended profile fields",
            description:
              recommendedTotal > 0
                ? `${recommendedComplete}/${recommendedTotal} recommended field${recommendedTotal === 1 ? "" : "s"} completed.`
                : "No recommended scalar fields are enabled right now.",
            complete: recommendedTotal === 0 || recommendedComplete >= recommendedTotal,
          },
        ] satisfies TalentChecklistItem[])
      : []),
  ];
}

export function calculateTalentCompletion(
  input: TalentCompletionInput,
): number {
  const items = buildTalentChecklist(input);
  const completed = items.filter((item) => item.complete).length;
  return Math.round((completed / items.length) * 100);
}

export function canSubmitTalentProfile(
  workflowStatus: string | null | undefined,
  completionScore: number,
): boolean {
  return (
    (workflowStatus === "draft" || workflowStatus === "hidden") &&
    completionScore >= TALENT_SUBMISSION_THRESHOLD
  );
}

export function formatWorkflowLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export type WorkflowGuidanceContext = {
  /** Profile completion percentage (0–100). */
  completionScore?: number;
  /** Count of incomplete checklist items (optional; when 0 with score ≥ threshold, draft copy is optimistic). */
  missingCount?: number;
  /** Defaults to {@link TALENT_SUBMISSION_THRESHOLD}. */
  threshold?: number;
};

export function workflowGuidance(
  status: string | null | undefined,
  context?: WorkflowGuidanceContext,
): string {
  const threshold = context?.threshold ?? TALENT_SUBMISSION_THRESHOLD;
  switch (status) {
    case "draft": {
      const scoreOk =
        context?.completionScore !== undefined && context.completionScore >= threshold;
      const checklistDone =
        context?.missingCount === undefined || context.missingCount === 0;
      if (scoreOk && checklistDone) {
        return "Checklist complete. Submit for review when you’re ready — you’ll stay in draft until the agency receives it.";
      }
      return "Your profile is still in draft. Complete the sections below, then submit when you’re ready for review.";
    }
    case "submitted":
      return "Your profile has been submitted to the agency. Staff will review and move it forward.";
    case "under_review":
      return "The agency is reviewing your profile. Keep an eye on revision requests and guidance.";
    case "approved":
      return "Your profile is approved. If visibility is public, the live public page is ready to share.";
    case "hidden":
      return "Your profile is intentionally hidden from public discovery. Submit again when you are ready for review.";
    case "archived":
      return "This profile is archived. Contact the agency if it should be restored to an active workflow.";
    default:
      return "Continue completing your profile and follow the current workflow state shown here.";
  }
}
