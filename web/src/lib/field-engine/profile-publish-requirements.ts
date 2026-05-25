import type { ResolvedField } from "@/lib/field-engine/resolve-talent-fields";

export type PublishBlockingResolvedField = Pick<
  ResolvedField,
  | "field_definition_id"
  | "field_key"
  | "label"
  | "is_required"
  | "required_before_publish"
  | "is_admin_only"
  | "default_visibility"
>;

export function isResolvedFieldPublishBlocking(
  field: PublishBlockingResolvedField,
): boolean {
  if (field.is_admin_only) return false;
  if (field.default_visibility.length === 0) return false;
  return field.required_before_publish || field.is_required;
}

export type CoreProfilePublishRequirement = {
  id: "stageName" | "primaryType" | "homeBase" | "photos" | "bio" | "language";
  label: string;
  met: boolean;
  sectionId: "services" | "location" | "media" | "about";
};

export type ResolverRequiredMissingItem = {
  id: string;
  label: string;
  groupKey?: string;
};

export type ProfilePublishRequirement = CoreProfilePublishRequirement | {
  id: string;
  label: string;
  met: false;
  sectionId: "profile_fields";
  groupKey?: string;
};

type BuildCorePublishRequirementsInput = {
  stageName: string;
  primaryType: string | null;
  homeBase: string;
  totalPhotos: number;
  activeBioLength: number;
  languageCount: number;
};

/**
 * Canonical non-catalog publish floor shared by admin profile shells.
 * Type-specific requirements come from the resolver and are merged via
 * `buildProfilePublishRequirements`.
 */
export function buildCorePublishRequirements(
  input: BuildCorePublishRequirementsInput,
): CoreProfilePublishRequirement[] {
  const remainingPhotos = Math.max(0, 3 - input.totalPhotos);
  const photoLabel = input.totalPhotos === 0
    ? "photos"
    : remainingPhotos === 1
      ? "1 more photo"
      : `${remainingPhotos} more photos`;
  return [
    {
      id: "stageName",
      label: "stage name",
      met: input.stageName.trim().length > 0,
      sectionId: "services",
    },
    {
      id: "primaryType",
      label: "Talent Type",
      met: !!input.primaryType,
      sectionId: "services",
    },
    {
      id: "homeBase",
      label: "home base",
      met: input.homeBase.trim().length > 0,
      sectionId: "location",
    },
    {
      id: "photos",
      label: photoLabel,
      met: input.totalPhotos >= 3,
      sectionId: "media",
    },
    {
      id: "bio",
      label: "a bio",
      met: input.activeBioLength >= 30,
      sectionId: "about",
    },
    {
      id: "language",
      label: "1 language",
      met: input.languageCount > 0,
      sectionId: "about",
    },
  ];
}

export function buildProfilePublishRequirements(input: {
  core: CoreProfilePublishRequirement[];
  resolverMissing: ResolverRequiredMissingItem[];
}): ProfilePublishRequirement[] {
  return [
    ...input.core,
    ...input.resolverMissing.map((item) => ({
      id: item.id,
      label: item.label,
      met: false as const,
      sectionId: "profile_fields" as const,
      groupKey: item.groupKey,
    })),
  ];
}

export function getProfilePublishCompleteness(
  requirements: readonly ProfilePublishRequirement[],
): number {
  if (requirements.length === 0) return 0;
  const completed = requirements.filter((r) => r.met).length;
  return Math.round((completed / requirements.length) * 100);
}

export type ProfileWorkflowStatus = "draft" | "pending" | "published" | "hidden";
export type ProfileWorkflowRole = "admin" | "talent";

export function getAllowedProfileStatusOptions(input: {
  role: ProfileWorkflowRole;
  currentStatus: ProfileWorkflowStatus;
  canPublish: boolean;
}): ProfileWorkflowStatus[] {
  if (input.role === "talent") {
    return input.currentStatus === "published" ? ["published", "pending"] : ["pending"];
  }

  const allowed: ProfileWorkflowStatus[] = ["draft", "pending", "hidden"];
  if (input.canPublish || input.currentStatus === "published") {
    allowed.splice(2, 0, "published");
  }
  return allowed;
}

export function canApplyProfileStatusTransition(input: {
  role: ProfileWorkflowRole;
  currentStatus: ProfileWorkflowStatus;
  nextStatus: ProfileWorkflowStatus;
  canPublish: boolean;
}): boolean {
  if (input.nextStatus !== "published") return true;
  if (input.currentStatus === "published") return true;
  if (input.role !== "admin") return false;
  return input.canPublish;
}
