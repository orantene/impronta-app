import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceUrlPlan } from "@/lib/saas/workspace-public-url";

export type BuilderWorkspacePlan = WorkspaceUrlPlan;

const KNOWN_BUILDER_PLANS = new Set<BuilderWorkspacePlan>([
  "free",
  "studio",
  "agency",
  "network",
  "legacy",
]);

export const DEFAULT_FREE_STARTER_SLUG = "free-quickstart-5" as const;

export interface BuilderPlanPolicy {
  plan: BuilderWorkspacePlan;
  maxPublicPages: number | null;
  maxVisibleRosterProfiles: number | null;
  workspaceTemplateLibrary: boolean;
  starterTemplateMode: "free-only" | "paid";
  shellEditMode: "locked" | "basic" | "full";
}

export type BuilderCapabilityKey =
  | "builder.section.body.edit"
  | "builder.shell.edit";

const BUILDER_PLAN_POLICY: Record<BuilderWorkspacePlan, BuilderPlanPolicy> = {
  free: {
    plan: "free",
    maxPublicPages: 1,
    maxVisibleRosterProfiles: 5,
    workspaceTemplateLibrary: false,
    starterTemplateMode: "free-only",
    shellEditMode: "locked",
  },
  studio: {
    plan: "studio",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "basic",
  },
  agency: {
    plan: "agency",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
  },
  network: {
    plan: "network",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
  },
  legacy: {
    plan: "legacy",
    maxPublicPages: null,
    maxVisibleRosterProfiles: null,
    workspaceTemplateLibrary: true,
    starterTemplateMode: "paid",
    shellEditMode: "full",
  },
};

export function normalizeBuilderWorkspacePlan(
  planTier: string | null | undefined,
): BuilderWorkspacePlan {
  if (planTier && KNOWN_BUILDER_PLANS.has(planTier as BuilderWorkspacePlan)) {
    return planTier as BuilderWorkspacePlan;
  }
  return "free";
}

export async function loadBuilderWorkspacePlan(
  supabase: SupabaseClient,
  tenantId: string,
  options?: {
    logTag?: string;
    onError?: (message: string) => void;
  },
): Promise<BuilderWorkspacePlan> {
  const { data, error } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .maybeSingle<{ plan_tier: string | null }>();

  if (error) {
    if (options?.onError) {
      options.onError(error.message);
    } else if (options?.logTag) {
      console.warn(`[${options.logTag}] failed to load workspace plan_tier`, {
        tenantId,
        error: error.message,
      });
    }
    return "free";
  }

  return normalizeBuilderWorkspacePlan(data?.plan_tier);
}

export function getBuilderPlanPolicy(
  planTier: string | null | undefined,
): BuilderPlanPolicy {
  return BUILDER_PLAN_POLICY[normalizeBuilderWorkspacePlan(planTier)];
}

export function builderPlanAllows(
  planTier: string | null | undefined,
  capability: BuilderCapabilityKey,
): boolean {
  const policy = getBuilderPlanPolicy(planTier);
  if (capability === "builder.section.body.edit") return true;
  if (capability === "builder.shell.edit") {
    return policy.shellEditMode !== "locked";
  }
  return false;
}

export function resolveStarterTemplateSlugs(
  planTier: string | null | undefined,
  allStarterSlugs: ReadonlyArray<string>,
  freeStarterSlug: string = DEFAULT_FREE_STARTER_SLUG,
): ReadonlyArray<string> {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.starterTemplateMode === "free-only") {
    return [freeStarterSlug];
  }
  return allStarterSlugs.filter((slug) => slug !== freeStarterSlug);
}

export function starterTemplateDeniedReason(
  planTier: string | null | undefined,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.starterTemplateMode === "free-only") {
    return "Free workspaces include one starter template. Upgrade to Studio to unlock additional starters.";
  }
  return null;
}

export function workspaceTemplateLibraryDeniedReason(
  planTier: string | null | undefined,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (!policy.workspaceTemplateLibrary) {
    return "Free workspaces include one landing template. Upgrade to Studio to unlock template library tools.";
  }
  return null;
}

export function cmsAdditionalPageDeniedReason(
  planTier: string | null | undefined,
): string | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.maxPublicPages === 1) {
    return "Free workspaces include one landing page. Upgrade to Studio to add more pages.";
  }
  return null;
}

export function clampFeaturedRosterLimitForPlan(
  planTier: string | null | undefined,
  value: unknown,
): number | null {
  const policy = getBuilderPlanPolicy(planTier);
  if (policy.maxVisibleRosterProfiles === null) return null;

  const max = policy.maxVisibleRosterProfiles;
  const min = 1;
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : max;
  return Math.max(min, Math.min(max, normalized));
}
